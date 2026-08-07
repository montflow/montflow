import { join } from 'node:path';
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

/** Agent session creation failure (prompt-turn failures are reported via AgentRunResult). */
export class AgentRunError extends Data.TaggedError('AgentRunError')<{
  readonly message: string;
}> {}

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

export interface AgentSessionOptions {
  readonly model: string;
  readonly systemPrompt: string;
  readonly tools: readonly string[];
  readonly cwd: string;
  /**
   * Optional live tool-activity callback for progress UI (e.g. the loop
   * widget). Fired from the agent event subscription; must not throw.
   */
  readonly onTool?: (activity: ToolActivity) => void;
}

export interface AgentRunOptions extends AgentSessionOptions {
  readonly task: string;
}

export interface PersistentAgent {
  readonly prompt: (
    task: string,
    timeoutMs?: number,
    onTool?: (activity: ToolActivity) => void,
  ) => Effect.Effect<AgentRunResult>;
  readonly dispose: () => Effect.Effect<void>;
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
 * @returns The turn result
 */
export const runOneTurn = (
  session: AgentSession,
  task: string,
  modelLabel: string,
  timeoutMs: number = 600000,
  onTool?: (activity: ToolActivity) => void,
  abortGraceMs: number = ABORT_GRACE_MS,
): Effect.Effect<AgentRunResult> =>
  Effect.gen(function* () {
    const events: AgentSessionEvent[] = [];
    const unsubscribe = yield* Effect.sync(() =>
      session.subscribe((event) => {
        events.push(event);
        if (event.type === 'tool_execution_start' || event.type === 'tool_execution_end') {
          reportTool(onTool, event);
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
        error: `${modelLabel} — Agent run timed out after ${timeoutMs}ms`,
        timedOut: true,
      };
    }
    if (Result.isFailure(outcome.value)) {
      return { text: '', error: outcome.value.failure.message };
    }

    const text = extractAssistantText(events);
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
      const session = yield* Effect.acquireRelease(createSession(options), (session) =>
        Effect.sync(() => session.dispose()),
      );
      return yield* runOneTurn(session, options.task, options.model, timeoutMs, options.onTool);
    }),
  );

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
    prompt: (task, timeoutMs, onTool) =>
      runOneTurn(session, task, options.model, timeoutMs ?? defaultTimeoutMs, onTool),
    dispose: () => Effect.sync(() => session.dispose()),
  }));

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

      const { session } = await createAgentSession({
        cwd: options.cwd,
        agentDir: getAgentDir(),
        model,
        modelRuntime: runtime,
        tools: [...options.tools],
        sessionManager: SessionManager.inMemory(),
        resourceLoader: loader,
      });

      return session;
    },
    catch: (cause) =>
      new AgentRunError({
        message: `Failed to create agent session (model: ${options.model}): ${errorMessage(cause)}`,
      }),
  });
