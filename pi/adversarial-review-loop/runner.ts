import { Data, Duration, Effect, Option, Result } from 'effect';
import {
  createAgentSession,
  SessionManager,
  DefaultResourceLoader,
  getAgentDir,
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
}

export interface AgentSessionOptions {
  readonly model: string;
  readonly systemPrompt: string;
  readonly tools: readonly string[];
  readonly cwd: string;
}

export interface AgentRunOptions extends AgentSessionOptions {
  readonly task: string;
}

export interface PersistentAgent {
  readonly prompt: (task: string, timeoutMs?: number) => Effect.Effect<AgentRunResult>;
  readonly dispose: () => Effect.Effect<void>;
}

/** Model type expected by createAgentSession (string names resolve via the model registry). */
type SessionModel = NonNullable<CreateAgentSessionOptions['model']>;

/**
 * Adapts a model *name* (string) to the SessionModel type expected by Pi's
 * createAgentSession. Pi's runtime accepts a name and resolves it through the
 * model registry, but the published type is `Model<Api>`. The cast through
 * `unknown` is the single place a raw string crosses that boundary — keep it
 * isolated here so it can be swapped when Pi's API stabilizes.
 * @param {string} name The model name
 * @returns The model value Pi expects
 */
const resolveModel = (name: string): SessionModel => name as unknown as SessionModel;

/**
 * Extracts a human-readable message from an unknown thrown value.
 * @param {unknown} cause The thrown value
 * @returns The error message
 */
const errorMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

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
 * Logs a tool execution start event. Runs inside the subscribe callback
 * (fire-and-forget progress output), so it uses console.log directly.
 * @param {Extract<AgentSessionEvent, { type: 'tool_execution_start' }>} event The event
 * @param {string} label Model label for the log prefix
 * @returns Nothing
 */
const onToolStart = (
  event: Extract<AgentSessionEvent, { type: 'tool_execution_start' }>,
  label: string,
): void => {
  const args: unknown = event.args;
  const summary =
    args !== null && typeof args === 'object' ? JSON.stringify(args).slice(0, 120) : '';
  console.log(`  [${label}] → ${event.toolName}${summary ? ` ${summary}` : ''}`);
};

/**
 * Logs a tool execution end event.
 * @param {Extract<AgentSessionEvent, { type: 'tool_execution_end' }>} event The event
 * @param {string} label Model label for the log prefix
 * @returns Nothing
 */
const onToolEnd = (
  event: Extract<AgentSessionEvent, { type: 'tool_execution_end' }>,
  label: string,
): void => {
  const marker = event.isError ? '✗' : '←';
  console.log(`  [${label}] ${marker} ${event.toolName}`);
};

/**
 * Runs a single prompt turn on an existing session: subscribes for events,
 * prompts, waits for idle, and enforces the timeout. Prompt/idle rejections
 * and timeouts are reported in the returned AgentRunResult (never in the
 * error channel).
 * @param {AgentSession} session The session to prompt
 * @param {string} task The task prompt
 * @param {string} modelLabel Model label for progress logging
 * @param {number} [timeoutMs] Turn timeout in milliseconds (default 10 minutes)
 * @returns The turn result
 */
const runOneTurn = (
  session: AgentSession,
  task: string,
  modelLabel: string,
  timeoutMs: number = 600000,
): Effect.Effect<AgentRunResult> =>
  Effect.gen(function* () {
    const events: AgentSessionEvent[] = [];
    const unsubscribe = yield* Effect.sync(() =>
      session.subscribe((event) => {
        events.push(event);
        if (event.type === 'tool_execution_start') onToolStart(event, modelLabel);
        if (event.type === 'tool_execution_end') onToolEnd(event, modelLabel);
      }),
    );

    const turn = Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: () => session.prompt(task),
        catch: (cause) => new AgentRunError({ message: errorMessage(cause) }),
      });
      yield* Effect.tryPromise({
        try: () => session.agent.waitForIdle(),
        catch: (cause) => new AgentRunError({ message: errorMessage(cause) }),
      });
    });

    const outcome = yield* turn.pipe(
      Effect.result,
      Effect.timeoutOption(Duration.millis(timeoutMs)),
      Effect.ensuring(Effect.sync(() => unsubscribe())),
    );

    if (Option.isNone(outcome)) {
      return { text: '', error: `Agent run timed out after ${timeoutMs}ms` };
    }
    if (Result.isFailure(outcome.value)) {
      return { text: '', error: outcome.value.failure.message };
    }

    const text = extractAssistantText(events);
    return text !== ''
      ? { text, error: undefined }
      : { text: '', error: 'No assistant response produced' };
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
      return yield* runOneTurn(session, options.task, options.model, timeoutMs);
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
    prompt: (task, timeoutMs) =>
      runOneTurn(session, task, options.model, timeoutMs ?? defaultTimeoutMs),
    dispose: () => Effect.sync(() => session.dispose()),
  }));

/**
 * Creates an agent session with skill auto-loading intentionally disabled
 * (`noSkills: true`). Agents load the extension's bundled skills under
 * `skills/` by absolute path (see buildReviewerSystem / FIXER_SYSTEM in
 * agents.ts and skill-paths.ts). Each agent reads the skill file fresh every run.
 *
 * The reviewer is created as a persistent agent via `createPersistentAgent`,
 * carrying conversation history across cycles so it remembers prior findings.
 * To prevent unbounded context growth, when the cycle count exceeds 3 the
 * reviewer task is prefixed with a context-summarization instruction
 * (see graph.ts). The review file remains the canonical state; the
 * persistent context is a convenience, not a necessity.
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

      const { session } = await createAgentSession({
        cwd: options.cwd,
        model: resolveModel(options.model),
        tools: [...options.tools],
        sessionManager: SessionManager.inMemory(),
        resourceLoader: loader,
      });

      return session;
    },
    catch: (cause) =>
      new AgentRunError({ message: `Failed to create agent session: ${errorMessage(cause)}` }),
  });
