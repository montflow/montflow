import { Effect, Layer } from 'effect';
import type { Message } from '@earendil-works/pi-ai';
import type { AgentSessionEvent, CreateAgentSessionOptions } from '@earendil-works/pi-coding-agent';
import {
  SessionFactory,
  type SessionEvent,
  type SessionFactoryImpl,
  type SessionPort,
  type SessionRequest,
  type SessionUi,
} from './runner.services.module.js';

/**
 * Real Pi session factory: an `AgentSession` over `SessionManager.inMemory`,
 * seeded from our stored transcript. Interaction is injected as custom tools
 * (`ask_user`, `notify_user`) bound to `SessionUi` — headless runs need no TUI
 * context, and Pi stays lazily imported so a missing install surfaces as a
 * typed load error instead of crashing the process.
 */

/** Narrow an `AgentMessage` to the Pi `Message` union our store mirrors. */
export const isPiMessage = (message: { readonly role: string }): message is Message =>
  message.role === 'user' || message.role === 'assistant' || message.role === 'toolResult';

/**
 * Map a Pi session event to our normalized session event. `message_end`
 * carries each message; `agent_settled` marks completion. Other events are
 * ignored (streaming deltas, tool updates, compaction).
 * @param event - Pi agent-session event
 * @returns normalized event, or undefined when irrelevant
 */
export const sessionEventOf = (event: AgentSessionEvent): SessionEvent | undefined => {
  if (event.type === 'message_end' && isPiMessage(event.message))
    return { type: 'message', message: event.message };
  if (event.type === 'agent_settled') return { type: 'settled' };
  return undefined;
};

/** Failure reason for a rejected Pi session call. */
const failure = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/** The live `AgentSession` surface {@link toPort} wraps. */
export interface PiAgentSession {
  readonly prompt: (text: string) => Promise<void>;
  readonly steer: (text: string) => Promise<void>;
  readonly followUp: (text: string) => Promise<void>;
  readonly abort: () => Promise<void>;
  readonly messages: ReadonlyArray<{ readonly role: string }>;
  readonly subscribe: (listener: (event: AgentSessionEvent) => void) => () => void;
  readonly dispose: () => void;
}

/** Custom tools bound to the run's UI: ask the user, notify the host. */
export const interactionTools = (
  pi: typeof import('@earendil-works/pi-coding-agent'),
  type: typeof import('typebox').Type,
  ui: SessionUi,
) => [
  pi.defineTool({
    name: 'ask_user',
    label: 'Ask user',
    description: 'Ask the user a question and wait for their answer before continuing.',
    promptSnippet: 'ask_user — ask the user a question and wait for the answer',
    parameters: type.Object({
      question: type.String({ description: 'The question to ask the user.' }),
    }),
    execute: async (_toolCallId, params) => {
      const answer = await ui.input(params.question);
      return {
        content: [{ type: 'text', text: answer ?? 'The user did not answer.' }],
        details: {},
      };
    },
  }),
  pi.defineTool({
    name: 'notify_user',
    label: 'Notify user',
    description: 'Send a short notification to the workspace without waiting for a reply.',
    promptSnippet: 'notify_user — send a short notification to the workspace',
    parameters: type.Object({
      message: type.String({ description: 'Notification text.' }),
    }),
    execute: (_toolCallId, params) => {
      ui.notify(params.message, 'info');
      return Promise.resolve({ content: [{ type: 'text', text: 'Notified.' }], details: {} });
    },
  }),
  pi.defineTool({
    name: 'toast_user',
    label: 'Toast user',
    description: 'Show a short toast in the workspace without waiting for a reply.',
    promptSnippet: 'toast_user — show a short toast in the workspace',
    parameters: type.Object({
      message: type.String({ description: 'Toast text.' }),
      variant: type.Optional(
        type.Union([type.Literal('info'), type.Literal('success'), type.Literal('error')]),
      ),
    }),
    execute: (_toolCallId, params) => {
      ui.toast(params.message, params.variant);
      return Promise.resolve({ content: [{ type: 'text', text: 'Toasted.' }], details: {} });
    },
  }),
  pi.defineTool({
    name: 'update_status',
    label: 'Update status',
    description:
      'Post a short progress update for the current run; it appears in the workspace runs list.',
    promptSnippet: 'update_status — post a short progress update for this run',
    parameters: type.Object({
      message: type.String({ description: 'Short status/progress message.' }),
    }),
    execute: (_toolCallId, params) => {
      ui.progress(params.message);
      return Promise.resolve({ content: [{ type: 'text', text: 'Status updated.' }], details: {} });
    },
  }),
];

/**
 * Union an explicit tool allowlist with the interaction tool names so
 * `ask_user` / `notify_user` stay enabled whenever the caller restricts
 * tools. Pi maps `options.tools` to `allowedToolNames` and filters custom
 * tools through it, so without this union a restricted run could never
 * park for an answer or notify its host.
 * @param tools - caller allowlist, or undefined for Pi's full default set
 * @param names - interaction tool names to guarantee
 * @returns allowlist including the interaction tools, or undefined
 */
export const withInteractionTools = (
  tools: ReadonlyArray<string> | undefined,
  names: ReadonlyArray<string>,
): ReadonlyArray<string> | undefined =>
  tools === undefined ? undefined : [...new Set([...tools, ...names])];

/** Wrap a live `AgentSession` as the runner's `SessionPort`. */
export const toPort = (session: PiAgentSession): SessionPort => {
  const listeners = new Set<(event: SessionEvent) => void>();
  session.subscribe((event) => {
    const normalized = sessionEventOf(event);
    if (normalized === undefined) return;
    for (const listener of listeners) listener(normalized);
  });
  return {
    prompt: (text) => Effect.tryPromise({ try: () => session.prompt(text), catch: failure }),
    steer: (text) => Effect.tryPromise({ try: () => session.steer(text), catch: failure }),
    followUp: (text) => Effect.tryPromise({ try: () => session.followUp(text), catch: failure }),
    abort: () => Effect.tryPromise({ try: () => session.abort(), catch: failure }),
    messages: () => session.messages.filter(isPiMessage),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: () => session.dispose(),
  };
};

/**
 * Build a `SessionPort` from an already-loaded Pi coding-agent module: seed a
 * fresh in-memory `SessionManager` with the stored transcript, resolve the
 * model, register the interaction tools, and wrap the created session.
 * Exported so the factory can be exercised without a real Pi install.
 * @param pi - Pi coding-agent module (or a fake in tests)
 * @param type - TypeBox `Type` builder used to declare tool parameters
 * @param request - session inputs for one run
 * @returns the wrapped session port
 */
export const createPort = async (
  pi: typeof import('@earendil-works/pi-coding-agent'),
  type: typeof import('typebox').Type,
  request: SessionRequest,
): Promise<SessionPort> => {
  const runtime = await pi.ModelRuntime.create();
  const manager = pi.SessionManager.inMemory(request.root);
  for (const message of request.replay) manager.appendMessage(message);
  const resolved =
    request.model === undefined || request.model === ''
      ? undefined
      : pi.resolveCliModel({ cliModel: request.model, modelRuntime: runtime });
  if (resolved?.error !== undefined)
    throw new Error(`Unknown model '${request.model}': ${resolved.error}`);
  const options: CreateAgentSessionOptions = {
    cwd: request.root,
    modelRuntime: runtime,
    sessionManager: manager,
    customTools: interactionTools(pi, type, request.ui),
  };
  const customTools = options.customTools ?? [];
  const tools = withInteractionTools(
    request.tools,
    customTools.map((tool) => tool.name),
  );
  if (tools !== undefined) options.tools = [...tools];
  if (resolved?.model !== undefined) options.model = resolved.model;
  const { session } = await pi.createAgentSession(options);
  return toPort(session);
};

const make: SessionFactoryImpl = {
  create: (request) =>
    Effect.tryPromise({
      try: async (): Promise<SessionPort> => {
        const pi = await import('@earendil-works/pi-coding-agent');
        const type = await import('typebox');
        return createPort(pi, type.Type, request);
      },
      catch: (cause) => (cause instanceof Error ? cause.message : String(cause)),
    }),
};

/** Real Pi session factory layer. */
export const PiSessionFactory: Layer.Layer<SessionFactory> = Layer.succeed(SessionFactory, make);
