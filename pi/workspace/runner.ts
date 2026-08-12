import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { Data, Duration, Effect, Option, Result } from 'effect';
import {
  createAgentSession,
  SessionManager,
  DefaultResourceLoader,
  getAgentDir,
  ModelRuntime,
  type AgentSession,
  type AgentSessionEvent,
  type CreateAgentSessionOptions,
} from '@earendil-works/pi-coding-agent';
import type { StreamKind } from './stream';
import { formatDuration } from './format';
import type { TurnUsage } from './run-stats';
import type { ThinkingLevel } from './config';

/** Agent session creation failure (prompt-turn failures are reported via AgentRunResult). */
export class AgentRunError extends Data.TaggedError('AgentRunError')<{
  readonly message: string;
}> {}

/** Failure classification for retry/fallback decisions. */
export type FailureKind = 'transient' | 'permanent';

/**
 * Classifies an agent failure message as transient (rate limits, provider
 * overload, network blips — worth retrying / falling back) or permanent
 * (auth, bad request, unknown model — retrying will not help). Timeouts are
 * always transient.
 * @param {string} message The failure message
 * @param {boolean} [timedOut] True when the turn was cut short by the timeout
 * @returns The failure kind
 */
export const classifyFailure = (message: string, timedOut?: boolean): FailureKind => {
  if (timedOut === true) return 'transient';
  const text = message.toLowerCase();
  const transient =
    /\b(rate\s?limit|too many requests|quota|throttl|retry after|overloaded|temporarily|temporary|busy)\b/.test(
      text,
    ) ||
    /\b(429|5\d\d|529|internal server error|bad gateway|service unavailable)\b/.test(
      text,
    ) ||
    /\b(econnreset|econnrefused|etimedout|socket|connection|network|timed out|timeout|upstream)\b/.test(
      text,
    );
  return transient ? 'transient' : 'permanent';
};

/**
 * Retry policy for agent turns: transient failures (rate limits, provider
 * overload, network blips) are retried on the same model with exponential
 * backoff before the caller falls back to the next model in the chain.
 */
export interface RetryPolicy {
  /** Max transient retries per model before falling back (0 = no retries). */
  readonly maxRetries: number;
  /** Base exponential backoff delay (ms); doubles after each retry. */
  readonly baseDelayMs: number;
}

/** Default retry policy: 2 transient retries with 2s → 4s backoff. */
export const DEFAULT_RETRY_POLICY: RetryPolicy = { maxRetries: 2, baseDelayMs: 2000 };

/** No retries — for tests and callers that handle failures themselves. */
export const NO_RETRY: RetryPolicy = { maxRetries: 0, baseDelayMs: 0 };

export interface AgentRunResult {
  readonly text: string;
  readonly error: string | undefined;
  /**
   * True when the turn was cut short by the timeout. The abort signal is
   * best-effort — a provider that ignores it (or an abort that hangs past
   * the grace window) leaves the generation running on the session — so a
   * caller that reuses the session must treat a timed-out turn as poisoned:
   * dispose and recreate the session instead of re-prompting it (the loop's
   * supervisor retry path, see F5).
   */
  readonly timedOut?: boolean;
}

/** Tool activity reported live during an agent turn. */
export interface ToolActivity {
  readonly kind: 'start' | 'end' | 'error';
  readonly tool: string;
}

/** Live token-delta callback kind: visible text vs. hidden thinking. */
export type { StreamKind } from './stream';

export interface AgentSessionOptions {
  readonly model: string;
  readonly systemPrompt: string;
  readonly tools: readonly string[];
  readonly cwd: string;
  /**
   * Optional extended-thinking level for this session (clamped to the
   * model's capabilities by pi). Omitted = pi default.
   */
  readonly thinkingLevel?: ThinkingLevel;
  /**
   * Optional live tool-activity callback for progress UI (e.g. the loop
   * widget). Fired from the agent event subscription; must not throw.
   */
  readonly onTool?: (activity: ToolActivity) => void;
  /**
   * Optional live token-delta callback (streaming text/thinking chunks from
   * `message_update` events). Fired from the agent event subscription; must
   * not throw.
   */
  readonly onDelta?: (delta: string, kind: StreamKind) => void;
  /**
   * Optional usage callback fired once per completed turn with the summed
   * provider-reported usage (tokens + cost) of the turn's assistant messages.
   * Timed-out turns report nothing (their usage may be partial). Must not
   * throw.
   */
  readonly onUsage?: (usage: TurnUsage) => void;
  /**
   * Persist the agent's conversation as a pi session file in this directory
   * instead of keeping it in memory (survives process restarts; resume with
   * `resumeSessionFile`). When omitted, the session is ephemeral.
   */
  readonly sessionDir?: string;
  /**
   * Continue an existing session file (created with `sessionDir` in a
   * previous process) — the agent replays the full transcript as context.
   */
  readonly resumeSessionFile?: string;
}

export interface AgentRunOptions extends AgentSessionOptions {
  readonly task: string;
}

export interface PersistentAgent {
  readonly prompt: (
    task: string,
    timeoutMs?: number,
    onTool?: (activity: ToolActivity) => void,
    onDelta?: (delta: string, kind: StreamKind) => void,
    onUsage?: (usage: TurnUsage) => void,
  ) => Effect.Effect<AgentRunResult>;
  readonly dispose: () => Effect.Effect<void>;
  /** The persisted session file path, or undefined when the session is in-memory. */
  readonly sessionFile: () => string | undefined;
}

/** Model type expected by createAgentSession (a real Model object). */
export type SessionModel = NonNullable<CreateAgentSessionOptions['model']>;

/** The slice of ModelRuntime used for model-name resolution. */
interface ModelLookup {
  getModel(providerId: string, modelId: string): SessionModel | undefined;
  getModels(): readonly SessionModel[];
}

/** Lazily-created shared model runtime (auth + catalog from the pi agent dir). */
let modelRuntimePromise: Promise<ModelRuntime> | undefined;

/**
 * The shared ModelRuntime used to resolve model names and carry auth. Created
 * once per process from the pi agent dir's `auth.json`/`models.json` — the
 * same source the main session uses.
 * @returns A promise for the shared runtime
 */
const getModelRuntime = (): Promise<ModelRuntime> => {
  modelRuntimePromise ??= ModelRuntime.create({
    authPath: join(getAgentDir(), 'auth.json'),
    modelsPath: join(getAgentDir(), 'models.json'),
  });
  return modelRuntimePromise;
};

/**
 * Resolves a `provider/model-id` (or bare model id) string to a real
 * `Model` object from the runtime. `createAgentSession` needs the Model
 * object — passing a raw string makes pi read `model.provider` as undefined
 * and fail with a misleading "No API key found for undefined".
 * @param {ModelLookup} runtime The model runtime
 * @param {string} [id] The model id (`provider/model-id` or bare `model-id`);
 *   undefined (e.g. an unset fixer model) resolves to undefined
 * @returns The resolved model, or undefined when not available
 */
export const resolveModelObject = (
  runtime: ModelLookup,
  id: string | undefined,
): SessionModel | undefined => {
  if (id === undefined) return undefined;
  const slash = id.indexOf('/');
  if (slash > 0) {
    return runtime.getModel(id.slice(0, slash), id.slice(slash + 1));
  }
  // Bare id — search every configured provider.
  return runtime.getModels().find((model) => model.id === id);
};

/**
 * Extracts a human-readable message from an unknown thrown value.
 * @param {unknown} cause The thrown value
 * @returns The error message
 */
const errorMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/**
 * Formats an agent failure message with the model that failed. Pi's own
 * errors can be vague about which model is at fault (e.g. "No API key found
 * for undefined"), so every agent error carries its `provider/model-id`.
 * @param {string} model The model id that failed
 * @param {unknown} cause The thrown value
 * @returns The prefixed message
 */
export const agentError = (model: string, cause: unknown): string =>
  `${model} — ${errorMessage(cause)}`;

/**
 * Type guard for text content blocks inside an assistant message.
 * @param {unknown} content The content block to check
 * @returns True when the block is a text content with a string payload
 */
const isTextContent = (content: unknown): content is { type: 'text'; text: string } =>
  typeof content === 'object' &&
  content !== null &&
  'type' in content &&
  content.type === 'text' &&
  'text' in content &&
  typeof content.text === 'string';

/**
 * Concatenates the final assistant text from each message_end event.
 * @param {readonly AgentSessionEvent[]} events Events collected during a turn
 * @returns The assistant's text output, trimmed
 */
const extractAssistantText = (events: readonly AgentSessionEvent[]): string => {
  let text = '';
  for (const event of events) {
    if (event.type !== 'message_end') continue;
    const message = event.message;
    if (!('role' in message) || message.role !== 'assistant') continue;

    const content: unknown = message.content;
    if (typeof content === 'string') {
      text = content;
      continue;
    }
    if (Array.isArray(content)) {
      text = content
        .filter(isTextContent)
        .map((block) => block.text)
        .join('');
    }
  }
  return text.trim();
};

/**
 * Sums the provider-reported usage of every assistant `message_end` in a
 * turn (a turn can emit several assistant messages when tools run mid-turn;
 * each carries its own usage). Tool-result usage is intentionally excluded
 * (not part of main LLM context accounting). Returns undefined when no
 * assistant message reported usage.
 * @param {readonly AgentSessionEvent[]} events Events collected during a turn
 * @returns The summed usage, or undefined
 */
const extractTurnUsage = (events: readonly AgentSessionEvent[]): TurnUsage | undefined => {
  let total: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    cost?: { total: number };
  } | undefined;
  for (const event of events) {
    if (event.type !== 'message_end') continue;
    const message = event.message;
    if (!('role' in message) || message.role !== 'assistant') continue;
    const usage = (message as { usage?: TurnUsage }).usage;
    if (usage === undefined) continue;
    total ??= { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    total.input += usage.input;
    total.output += usage.output;
    total.cacheRead += usage.cacheRead;
    total.cacheWrite += usage.cacheWrite;
    total.cost = { total: (total.cost?.total ?? 0) + (usage.cost?.total ?? 0) };
  }
  return total;
};

/**
 * Reports a tool event to the optional progress callback.
 * @param {(activity: ToolActivity) => void | undefined} onTool Progress callback
 * @param {Extract<AgentSessionEvent, { type: 'tool_execution_start' | 'tool_execution_end' }>} event The event
 * @returns Nothing
 */
export const reportTool = (
  onTool: ((activity: ToolActivity) => void) | undefined,
  event: Extract<AgentSessionEvent, { type: 'tool_execution_start' | 'tool_execution_end' }>,
): void => {
  if (onTool === undefined) return;
  onTool({
    kind:
      event.type === 'tool_execution_start' ? 'start' : event.isError ? 'error' : 'end',
    tool: event.toolName,
  });
};

/**
 * How long `runOneTurn` waits for a timed-out session to abort and go idle
 * before giving up. `session.abort()` awaits the agent's idle wait, which can
 * hang if a provider ignores the abort signal — bounding it keeps the timeout
 * path from blocking the loop indefinitely.
 */
const ABORT_GRACE_MS = 30_000;

/**
 * Runs a single prompt turn on an existing session: subscribes for events,
 * prompts, waits for idle, and enforces the timeout. Prompt/idle rejections
 * and timeouts are reported in the returned AgentRunResult (never in the
 * error channel). Tool activity is forwarded to the optional onTool callback.
 *
 * On timeout the in-flight generation is aborted via `session.abort()` before
 * returning (bounded by `abortGraceMs`). The abort is best-effort — a
 * provider that ignores it leaves the generation running — so the result
 * carries `timedOut: true` and a caller that reuses the session must dispose
 * and recreate it rather than re-prompt a possibly-busy agent.
 * @param {AgentSession} session The session to prompt
 * @param {string} task The task prompt
 * @param {string} modelLabel Model label for error messages
 * @param {number} [timeoutMs] Turn timeout in milliseconds (default 10 minutes)
 * @param {(activity: ToolActivity) => void} [onTool] Live tool-activity callback
 * @param {(delta: string, kind: StreamKind) => void} [onDelta] Live token-delta callback
 * @param {number} [abortGraceMs] How long to wait for a timed-out session to abort
 * @param {(usage: TurnUsage) => void} [onUsage] Usage callback (completed turns only)
 * @returns The turn result
 */
export const runOneTurn = (
  session: AgentSession,
  task: string,
  modelLabel: string,
  timeoutMs: number = 600000,
  onTool?: (activity: ToolActivity) => void,
  onDelta?: (delta: string, kind: StreamKind) => void,
  abortGraceMs: number = ABORT_GRACE_MS,
  onUsage?: (usage: TurnUsage) => void,
): Effect.Effect<AgentRunResult> =>
  Effect.gen(function* () {
    const events: AgentSessionEvent[] = [];
    const unsubscribe = yield* Effect.sync(() =>
      session.subscribe((event) => {
        events.push(event);
        if (event.type === 'tool_execution_start' || event.type === 'tool_execution_end') {
          reportTool(onTool, event);
        } else if (event.type === 'message_update') {
          // Live streaming: forward text/thinking token deltas to the UI.
          const streamEvent = event.assistantMessageEvent;
          if (streamEvent.type === 'text_delta') onDelta?.(streamEvent.delta, 'text');
          else if (streamEvent.type === 'thinking_delta') onDelta?.(streamEvent.delta, 'thinking');
        }
      }),
    );

    const turn = Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: () => session.prompt(task),
        catch: (cause) => new AgentRunError({ message: agentError(modelLabel, cause) }),
      });
      yield* Effect.tryPromise({
        try: () => session.agent.waitForIdle(),
        catch: (cause) => new AgentRunError({ message: agentError(modelLabel, cause) }),
      });
    });

    const outcome = yield* turn.pipe(
      Effect.result,
      Effect.timeoutOption(Duration.millis(timeoutMs)),
      Effect.ensuring(Effect.sync(() => unsubscribe())),
    );

    if (Option.isNone(outcome)) {
      // Effect.timeoutOption interrupted the effect, but session.prompt(task)
      // is a plain promise inside Effect.tryPromise — interruption does NOT
      // cancel it, so the in-flight generation keeps running and the session
      // stays busy. The caller can re-prompt this same session (the supervisor
      // brief/aggregate retry path), which would then fail with pi's "Agent is
      // already processing a prompt" error or interleave two event streams.
      // Abort the generation and wait for the agent to go idle before
      // returning. The abort is best-effort: a provider that ignores it (or
      // an abort that hangs) is bounded by `abortGraceMs`, after which the
      // generation may STILL be running — the caller must then treat the
      // session as poisoned (dispose + recreate), which is why the result
      // carries `timedOut: true`.
      yield* Effect.tryPromise({
        try: () => session.abort(),
        catch: () => undefined,
      }).pipe(
        Effect.ignore,
        Effect.timeoutOption(Duration.millis(abortGraceMs)),
      );
      return {
        text: '',
        error: `${modelLabel} — Agent run timed out after ${formatDuration(timeoutMs)}`,
        timedOut: true,
      };
    }
    if (Result.isFailure(outcome.value)) {
      return { text: '', error: outcome.value.failure.message };
    }

    const text = extractAssistantText(events);
    if (onUsage !== undefined) {
      const usage = extractTurnUsage(events);
      if (usage !== undefined) onUsage(usage);
    }
    return text !== ''
      ? { text, error: undefined }
      : { text: '', error: `${modelLabel} — No assistant response produced` };
  });

/**
 * Run a single-use agent: one prompt, fresh context. The session is disposed
 * when the effect completes (scoped acquire/release).
 * @param {AgentRunOptions} options Agent configuration plus the task prompt
 * @param {number} [timeoutMs] Turn timeout in milliseconds
 * @returns The turn result
 */
export const runAgent = (
  options: AgentRunOptions,
  timeoutMs?: number,
): Effect.Effect<AgentRunResult, AgentRunError> =>
  Effect.scoped(
    Effect.gen(function* () {
      const session = yield* Effect.acquireRelease(createSession(options), (acquired) =>
        Effect.sync(() => acquired.dispose()),
      );
      return yield* runOneTurn(
        session,
        options.task,
        options.model,
        timeoutMs,
        options.onTool,
        options.onDelta,
        undefined,
        options.onUsage,
      );
    }),
  );

/**
 * Runs a single-use agent across an ordered chain of models with per-model
 * transient retries (the retry/fallback policy for rate limits, provider
 * overloads, and network blips). Each model is tried up to `maxRetries`
 * transient retries (exponential backoff) before falling back to the next
 * model; permanent failures skip straight to the next model. The first clean
 * success wins. When every attempt fails, returns a synthesized
 * {@link AgentRunResult} whose error aggregates ALL failures (which model
 * failed with what), so callers can report exactly why. `timedOut` reflects
 * the last failure (a timeout poisons a session, but single-use runs create a
 * fresh session per call, so retrying is always safe).
 * @param {(options: AgentRunOptions, timeoutMs?: number) => Effect.Effect<AgentRunResult, AgentRunError>} base The single-use runner (e.g. {@link runAgent})
 * @param {readonly string[]} models Ordered model chain: primary first, then fallbacks
 * @param {(model: string) => AgentRunOptions} buildOptions Builds the run options for a model
 * @param {number} timeoutMs Turn timeout
 * @param {RetryPolicy} [policy] Retry policy (default {@link DEFAULT_RETRY_POLICY})
 * @returns The first successful result, or an aggregated failure result
 */
export const runAgentResilient = (
  base: (
    options: AgentRunOptions,
    timeoutMs?: number,
  ) => Effect.Effect<AgentRunResult, AgentRunError>,
  models: readonly string[],
  buildOptions: (model: string) => AgentRunOptions,
  timeoutMs: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): Effect.Effect<AgentRunResult, AgentRunError> =>
  Effect.gen(function* () {
    if (models.length === 0) {
      return { text: '', error: 'No models configured for this agent role' };
    }
    const failures: string[] = [];
    let lastTimedOut = false;
    for (const model of models) {
      let delay = policy.baseDelayMs;
      for (let attempt = 0; ; attempt++) {
        const outcome = yield* Effect.result(base(buildOptions(model), timeoutMs));
        if (Result.isFailure(outcome)) {
          // Session creation / model resolution / auth failure.
          const message = outcome.failure.message;
          failures.push(`${model}: ${message}`);
          if (attempt >= policy.maxRetries || classifyFailure(message) === 'permanent') break;
          yield* Effect.sleep(Duration.millis(delay));
          delay *= 2;
          continue;
        }
        const result = outcome.success;
        if (result.error === undefined) return result;
        failures.push(`${model}: ${result.error}`);
        lastTimedOut = result.timedOut === true;
        if (
          result.timedOut === true ||
          attempt >= policy.maxRetries ||
          classifyFailure(result.error) === 'permanent'
        ) {
          break;
        }
        yield* Effect.sleep(Duration.millis(delay));
        delay *= 2;
      }
    }
    return {
      text: '',
      error: `All ${models.length} model(s) failed: ${failures.join(' | ')}`,
      timedOut: lastTimedOut,
    };
  });

/**
 * Creates an agent session that persists across multiple prompts.
 * The same context (system prompt, conversation history) carries forward.
 * Use for the reviewer so it remembers previous cycles' findings.
 * The caller is responsible for running the returned dispose effect.
 * @param {AgentSessionOptions} options Agent configuration
 * @param {number} [defaultTimeoutMs] Default per-turn timeout in milliseconds
 * @returns The persistent agent handle
 */
export const createPersistentAgent = (
  options: AgentSessionOptions,
  defaultTimeoutMs?: number,
): Effect.Effect<PersistentAgent, AgentRunError> =>
  Effect.map(createSession(options), (session) => ({
    prompt: (task, timeoutMs, onTool, onDelta, onUsage) =>
      runOneTurn(
        session,
        task,
        options.model,
        timeoutMs ?? defaultTimeoutMs,
        onTool ?? options.onTool,
        onDelta ?? options.onDelta,
        undefined,
        onUsage ?? options.onUsage,
      ),
    dispose: () => Effect.sync(() => session.dispose()),
    sessionFile: () => session.sessionFile,
  }));

/**
 * Wraps a persistent agent's prompt with a transient-retry policy: rate
 * limits / provider overloads / network blips are retried on the SAME session
 * with exponential backoff (the session is idle after a rejected turn, so
 * re-prompting is safe). Timed-out turns are NOT retried — the generation may
 * still be running on the session (abort is best-effort), so the caller must
 * dispose the session instead. Permanent failures are returned immediately.
 * @param {PersistentAgent['prompt']} prompt The agent's prompt function
 * @param {number} defaultTimeoutMs Default turn timeout
 * @param {RetryPolicy} [policy] Retry policy (default {@link DEFAULT_RETRY_POLICY})
 * @returns The wrapped prompt
 */
export const retryPrompt = (
  prompt: PersistentAgent['prompt'],
  defaultTimeoutMs: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): PersistentAgent['prompt'] =>
  (task, timeoutMs, onTool, onDelta, onUsage) =>
    Effect.gen(function* () {
      let delay = policy.baseDelayMs;
      for (let attempt = 0; ; attempt++) {
        const result = yield* prompt(
          task,
          timeoutMs ?? defaultTimeoutMs,
          onTool,
          onDelta,
          onUsage,
        );
        if (result.error === undefined || result.timedOut === true) return result;
        if (attempt >= policy.maxRetries) return result;
        if (classifyFailure(result.error) === 'permanent') return result;
        yield* Effect.sleep(Duration.millis(delay));
        delay *= 2;
      }
    });

/**
 * Creates an agent session with skill auto-loading intentionally disabled
 * (`noSkills: true`). Agents load the extension's bundled skills under
 * `skills/` by absolute path (see buildReviewerSystem / FIXER_SYSTEM in
 * agents.ts and skill-paths.ts). Each agent reads the skill file fresh every run.
 *
 * Reviewers are never persisted: each cycle runs a fresh reviewer agent via
 * `runAgent` (see runFreshReviewer in graph.ts), so conversation history does
 * not carry across cycles. Only the supervisor is persistent, created once via
 * `createPersistentAgent` (see ensureSupervisor in graph.ts). Cross-cycle
 * context is kept in the review file, which remains the canonical state.
 *
 * The model name is resolved to a real `Model` object via the shared
 * `ModelRuntime` before `createAgentSession` (passing a raw string makes pi
 * read `model.provider` as undefined and fail with a misleading "No API key
 * found for undefined").
 *
 * @param {AgentSessionOptions} options Agent configuration
 * @returns The created session
 */
const createSession = (
  options: AgentSessionOptions,
): Effect.Effect<AgentSession, AgentRunError> =>
  Effect.tryPromise({
    try: async () => {
      const loader = new DefaultResourceLoader({
        cwd: options.cwd,
        agentDir: getAgentDir(),
        systemPrompt: options.systemPrompt,
        noExtensions: true,
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
      });
      await loader.reload();

      const runtime = await getModelRuntime();
      const model = resolveModelObject(runtime, options.model);
      if (model === undefined) {
        throw new Error(
          `Model '${options.model}' is not available in this pi setup. ` +
            'Pick an available model when creating the preset, or check /models.',
        );
      }

      // File-backed sessions persist the conversation (like the user's own pi
      // sessions) so a run can be resumed after a restart; in-memory sessions
      // are ephemeral.
      let sessionManager: SessionManager;
      if (options.sessionDir !== undefined) {
        await mkdir(options.sessionDir, { recursive: true });
        sessionManager =
          options.resumeSessionFile !== undefined
            ? SessionManager.open(options.resumeSessionFile, options.sessionDir, options.cwd)
            : SessionManager.create(options.cwd, options.sessionDir);
      } else {
        sessionManager = SessionManager.inMemory();
      }

      const { session } = await createAgentSession({
        cwd: options.cwd,
        agentDir: getAgentDir(),
        model,
        modelRuntime: runtime,
        thinkingLevel: options.thinkingLevel,
        tools: [...options.tools],
        sessionManager,
        resourceLoader: loader,
      });

      return session;
    },
    catch: (cause) =>
      new AgentRunError({
        message: `Failed to create agent session (model: ${options.model}): ${errorMessage(cause)}`,
      }),
  });
