import { Context, Data, Effect } from 'effect';
import type { ModelRuntime } from '@earendil-works/pi-coding-agent';

/**
 * Everything an agentic run needs. All strings except `prompt` may be blank
 * (blank parts drop out of the assembled prompt).
 */
export interface AgentRunRequest {
  /** Working directory the child agent runs in. */
  readonly cwd: string;
  /** Instructions before the user prompt (role, format, rules). */
  readonly preprompt: string;
  /** The user prompt (what to create, modify, or answer). */
  readonly prompt: string;
  /** Instructions after the user prompt (reply shape, stop conditions). */
  readonly postprompt: string;
  /** Model as `provider/model-id`; undefined selects the session default. */
  readonly modelLabel: string | undefined;
  /** Tool allowlist for the child (e.g. `['read', 'write', 'edit']`). */
  readonly tools: ReadonlyArray<string>;
}

/** Failure of an agentic run: load, resolve, spawn, prompt, or empty reply. */
export class AgentRunError extends Data.TaggedError('AgentRunError')<{
  readonly message: string;
}> {}

/**
 * Model runtime the child session resolves models against. Yielded inside
 * {@link runAgent} — consumers provide it (one shared runtime per process
 * is enough; build with `ModelRuntime.create()`).
 */
export class AgentModelRuntime extends Context.Service<AgentModelRuntime, ModelRuntime>()(
  '@montflow/pi-effect/AgentModelRuntime',
) {}

/** One assistant content block, structurally typed (no pi-ai dependency). */
export interface AgentContentBlock {
  readonly type: string;
  readonly text?: string;
}

/** One session message, structurally typed (no pi-ai dependency). */
export interface AgentMessageStruct {
  readonly role: string;
  readonly content?: string | ReadonlyArray<AgentContentBlock>;
}

/**
 * Assemble the child prompt: preprompt, user prompt, postprompt separated
 * by blank lines. Blank parts drop out.
 * @param request - run request
 * @returns the assembled prompt text
 */
export const buildPrompt = (
  request: Pick<AgentRunRequest, 'preprompt' | 'prompt' | 'postprompt'>,
): string =>
  [request.preprompt, request.prompt, request.postprompt]
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join('\n\n');

/**
 * Last non-blank assistant text in a message list, if any.
 * @param messages - session messages oldest-first
 * @returns the reply text, or undefined when the agent never answered
 */
export const finalText = (messages: ReadonlyArray<AgentMessageStruct>): string | undefined => {
  const texts: Array<string> = [];
  for (const message of messages) {
    if (message.role !== 'assistant' || !Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (block.type !== 'text' || block.text === undefined || block.text.trim() === '') continue;
      texts.push(block.text);
    }
  }
  return texts[texts.length - 1];
};

interface ChildSession {
  readonly prompt: (text: string) => Promise<void>;
  readonly messages: ReadonlyArray<AgentMessageStruct>;
  readonly dispose: () => void;
}

/**
 * Run an isolated child agent and return its final reply text: resolve the
 * model, open an in-memory session, prompt once, extract the reply, dispose.
 * File or workspace effects are the caller's job — read them after the
 * reply (e.g. diff a directory for newly created files).
 * @param request - run request
 * @returns Effect resolving to the reply text, requiring AgentModelRuntime
 */
export const runAgent = (
  request: AgentRunRequest,
): Effect.Effect<string, AgentRunError, AgentModelRuntime> =>
  Effect.gen(function* () {
    const runtime = yield* AgentModelRuntime;
    const pi = yield* Effect.promise(() => import('@earendil-works/pi-coding-agent')).pipe(
      Effect.mapError(
        (error) =>
          new AgentRunError({ message: `Failed to load the Pi runtime: ${String(error)}` }),
      ),
    );
    const resolved =
      request.modelLabel === undefined
        ? undefined
        : pi.resolveCliModel({ cliModel: request.modelLabel, modelRuntime: runtime });
    if (resolved?.error !== undefined) {
      return yield* Effect.fail(
        new AgentRunError({ message: `Unknown model '${request.modelLabel}'.` }),
      );
    }
    const baseOptions = {
      cwd: request.cwd,
      modelRuntime: runtime,
      tools: [...request.tools],
    };
    const sessionOptions =
      resolved?.model === undefined ? baseOptions : { ...baseOptions, model: resolved.model };
    const replyText = yield* Effect.acquireUseRelease(
      Effect.promise(() =>
        pi
          .createAgentSession({
            ...sessionOptions,
            sessionManager: pi.SessionManager.inMemory(request.cwd),
          })
          .then(({ session: created }): ChildSession => ({
            prompt: (text) => created.prompt(text),
            messages: created.messages,
            dispose: () => created.dispose(),
          })),
      ).pipe(
        Effect.mapError(
          (error) => new AgentRunError({ message: `Failed to start the agent: ${String(error)}` }),
        ),
      ),
      (child) =>
        Effect.promise(() => child.prompt(buildPrompt(request))).pipe(
          Effect.mapError(
            (error) => new AgentRunError({ message: `Agent run failed: ${String(error)}` }),
          ),
          Effect.flatMap(() => {
            const reply = finalText(child.messages);
            return reply === undefined
              ? Effect.fail(new AgentRunError({ message: 'The agent finished without replying.' }))
              : Effect.succeed(reply);
          }),
        ),
      (child) => Effect.sync(() => child.dispose()),
    );
    return replyText;
  });
