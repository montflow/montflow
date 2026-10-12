import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Effect, Layer } from 'effect';
import { Type } from 'typebox';
import {
  type CommandAction,
  COMMAND_DESCRIPTION,
  COMMAND_NAME,
  type ExecuteOptions,
  execute,
  parseCommand,
} from './apps/commands/index.js';
import {
  createSessionRunnerHost,
  sessionRunnerLayer,
  setActiveSessionRunnerHost,
} from './apps/runtime/index.js';
import { SessionRunner, type SessionDetail, WorkspaceBridge } from './services/index.js';

/**
 * Pi extension: `/mf-sessions` plus agent-callable tools over the session engine.
 * The engine's live-session registry persists for the extension's lifetime, so
 * `steer`/`answer` reach sessions started in the same Pi session.
 */

export { COMMAND_DESCRIPTION, COMMAND_NAME };

/** The slice of the Pi context the surfaces need. */
export interface SurfaceContext {
  readonly cwd: string;
  readonly ui: {
    readonly notify: (message: string, type?: 'info' | 'warning' | 'error') => void;
  };
}

/** Test seam + E001 hook injection for the extension. */
export interface PiSessionsExtensionOptions {
  /** Build the session runner layer for a repo root; defaults to the real file-backed layer. */
  readonly sessionRunnerLayerFor?: (
    root: string,
    bridge: Layer.Layer<WorkspaceBridge>,
  ) => Layer.Layer<SessionRunner>;
  /**
   * A004 completion seam: invoked once per settled session with the dispatching
   * context. E001 composes the `/mf-profiles-cli create` invocation here; Phase
   * C only guarantees the seam and the per-session completion notification.
   */
  readonly onSettled?: (detail: SessionDetail, ctx: SurfaceContext) => Effect.Effect<void>;
}

/** Pi's notify channel has no success variant; success rides the info channel. */
const notifyType = (variant: 'info' | 'success' | 'error' | undefined): 'info' | 'error' =>
  variant === 'error' ? 'error' : 'info';

/** Thinking levels a `session_start` call may pin; mirrors Pi's `ThinkingLevel`. */
const THINKING_LEVEL = Type.Union(
  [
    Type.Literal('off'),
    Type.Literal('minimal'),
    Type.Literal('low'),
    Type.Literal('medium'),
    Type.Literal('high'),
    Type.Literal('xhigh'),
    Type.Literal('max'),
  ],
  { description: 'Thinking level; defaults to the current session thinking level.' },
);

/** `provider/model-id` for a Pi model, or undefined when no model is active. */
const modelLabelOf = (
  model: { readonly provider: string; readonly id: string } | undefined,
): string | undefined => (model === undefined ? undefined : `${model.provider}/${model.id}`);

/** Tool result shape for a rendered command output. */
const textResult = (text: string) => ({
  content: [{ type: 'text' as const, text }],
  details: {},
});

/** Per-session completion notification, bound to the dispatching context. */
const completionNotice = (ctx: SurfaceContext, detail: SessionDetail): Effect.Effect<void> =>
  Effect.sync(() => {
    const outcome = detail.receipt?.outcome ?? 'done';
    const summary = detail.receipt?.summary ?? '';
    ctx.ui.notify(
      `Session '${detail.session.id}' ${outcome}: ${summary}`.trim(),
      outcome === 'failed' ? 'error' : 'info',
    );
  });

/**
 * Pi extension entry: registers `/mf-sessions` and the session tools. One session
 * runner runtime is built per repo root, so live sessions persist across commands/tools
 * and stay rooted in their own repository.
 * @param options - test seam and the E001 completion hook
 * @returns the extension factory Pi invokes with its API
 */
export const makePiSessionsExtension =
  (options: PiSessionsExtensionOptions = {}) =>
  (pi: Pick<ExtensionAPI, 'registerCommand' | 'registerTool' | 'on'>): Promise<void> => {
    const contexts = new Map<string, SurfaceContext>();

    /** Bridge bound to the dispatching context of each repo root. */
    const bridgeFor = (root: string): Layer.Layer<WorkspaceBridge> =>
      Layer.succeed(WorkspaceBridge, {
        toast: (message, variant) =>
          Effect.sync(() => {
            contexts.get(root)?.ui.notify(message, notifyType(variant));
          }),
        notify: (title, body) =>
          Effect.sync(() => {
            contexts.get(root)?.ui.notify(`${title}: ${body}`, 'info');
          }),
      });

    const host = createSessionRunnerHost({
      layerFor:
        options.sessionRunnerLayerFor ?? ((root, bridge) => sessionRunnerLayer({ root, bridge })),
      bridgeFor,
    });
    setActiveSessionRunnerHost(host);

    const dispatch = (
      ctx: SurfaceContext,
      action: CommandAction,
      executeOptions?: ExecuteOptions,
    ): Promise<string> => {
      contexts.set(ctx.cwd, ctx);
      return host.runtimeFor(ctx.cwd).runPromise(
        execute(action, ctx.cwd, executeOptions).pipe(
          Effect.matchEffect({
            onFailure: (error) => Effect.succeed(`Error: ${error}`),
            onSuccess: (text) => Effect.succeed(text),
          }),
        ),
      );
    };

    /** Compose the built-in notice with the E001 hook seam. */
    const settledHook = (ctx: SurfaceContext, detail: SessionDetail): Effect.Effect<void> =>
      Effect.gen(function* () {
        yield* completionNotice(ctx, detail);
        if (options.onSettled !== undefined) yield* options.onSettled(detail, ctx);
      });

    /** Interrupt a single session through its root's runtime. */
    const interruptSession = (root: string, id: string): Promise<void> =>
      host
        .runtimeFor(root)
        .runPromise(
          Effect.gen(function* () {
            const sessionRunner = yield* SessionRunner;
            yield* sessionRunner.interrupt(root, id).pipe(Effect.catch(() => Effect.void));
          }),
        )
        .catch(() => undefined);

    /** On shutdown, cancel every live session, then dispose every runtime. */
    const shutdown = async (): Promise<void> => {
      await Promise.all(
        Array.from(contexts.keys(), (root) =>
          host
            .runtimeFor(root)
            .runPromise(
              Effect.gen(function* () {
                const sessionRunner = yield* SessionRunner;
                const sessions = yield* sessionRunner
                  .list(root)
                  .pipe(Effect.orElseSucceed(() => []));
                yield* Effect.forEach(
                  sessions.filter(
                    (session) =>
                      session.status === 'running' || session.status === 'awaiting-input',
                  ),
                  (session) =>
                    sessionRunner.interrupt(root, session.id).pipe(Effect.catch(() => Effect.void)),
                  { discard: true },
                );
              }),
            )
            .catch(() => undefined),
        ),
      );
      await host.disposeAll();
      contexts.clear();
    };

    pi.on('session_shutdown', () => shutdown());

    pi.registerCommand(COMMAND_NAME, {
      description: COMMAND_DESCRIPTION,
      handler: async (args, ctx) => {
        const text = await dispatch(ctx, parseCommand(args));
        ctx.ui.notify(text, 'info');
      },
    });

    pi.registerTool({
      name: 'session_start',
      label: 'Start session',
      description:
        'Start a local agent session for the given id and prompt. Returns as soon as the session is started; use session_status/session_steer/session_answer to follow it. Optionally set a parent session, related session ids, a model, a thinking level, or a tool allowlist. Defaults to the current session model and thinking level.',
      promptSnippet: 'session_start — start a local agent session',
      parameters: Type.Object({
        id: Type.String({ description: 'Directory-safe session id.' }),
        prompt: Type.String({ description: 'The prompt for the session.' }),
        name: Type.Optional(Type.String({ description: 'Display name.' })),
        model: Type.Optional(
          Type.String({
            description: 'provider/model-id pin; defaults to the current session model.',
          }),
        ),
        thinking: Type.Optional(THINKING_LEVEL),
        parent: Type.Optional(Type.String({ description: 'Parent session id.' })),
        related: Type.Optional(Type.Array(Type.String(), { description: 'Related session ids.' })),
        tools: Type.Optional(Type.Array(Type.String(), { description: 'Tool allowlist.' })),
      }),
      execute: async (_toolCallId, params, signal, _onUpdate, ctx) => {
        const surface: SurfaceContext = ctx;
        const text = await dispatch(
          surface,
          {
            kind: 'Start',
            id: params.id,
            prompt: params.prompt,
            name: params.name,
            model: params.model ?? modelLabelOf(ctx.model),
            thinking: params.thinking ?? ctx.thinkingLevel,
            parent: params.parent,
            related: params.related,
            tools: params.tools,
          },
          {
            startMode: 'detach',
            onSettled: (detail) => settledHook(surface, detail),
          },
        );
        signal?.addEventListener('abort', () => void interruptSession(surface.cwd, params.id), {
          once: true,
        });
        return textResult(text);
      },
    });

    pi.registerTool({
      name: 'session_status',
      label: 'Session status',
      description: 'Show one session: status, turn count, and receipt.',
      promptSnippet: 'session_status — show a session',
      parameters: Type.Object({ id: Type.String({ description: 'Session id.' }) }),
      execute: async (_toolCallId, params, _signal, _onUpdate, ctx) =>
        textResult(await dispatch(ctx, { kind: 'Status', id: params.id })),
    });

    pi.registerTool({
      name: 'session_verify',
      label: 'Verify session',
      description: 'Mechanically verify a session: validity and resumability.',
      promptSnippet: 'session_verify — verify a session is valid and resumable',
      parameters: Type.Object({ id: Type.String({ description: 'Session id.' }) }),
      execute: async (_toolCallId, params, _signal, _onUpdate, ctx) =>
        textResult(await dispatch(ctx, { kind: 'Verify', id: params.id })),
    });

    pi.registerTool({
      name: 'session_list',
      label: 'List sessions',
      description: 'List local sessions, optionally filtered to the given lifecycle statuses.',
      promptSnippet: 'session_list — list local sessions, optionally filtered by status',
      parameters: Type.Object({
        status: Type.Optional(
          Type.String({
            description:
              'Comma-separated statuses to keep: pending, running, awaiting-input, done, failed, cancelled.',
          }),
        ),
      }),
      execute: async (_toolCallId, params, _signal, _onUpdate, ctx) =>
        textResult(await dispatch(ctx, { kind: 'List', status: params.status })),
    });

    pi.registerTool({
      name: 'session_resume',
      label: 'Resume session',
      description: 'Resume a valid, resumable session, optionally with a new prompt.',
      promptSnippet: 'session_resume — resume a session',
      parameters: Type.Object({
        id: Type.String({ description: 'Session id.' }),
        prompt: Type.Optional(Type.String({ description: 'Optional prompt to continue with.' })),
      }),
      execute: async (_toolCallId, params, _signal, _onUpdate, ctx) =>
        textResult(await dispatch(ctx, { kind: 'Resume', id: params.id, prompt: params.prompt })),
    });

    pi.registerTool({
      name: 'session_interrupt',
      label: 'Interrupt session',
      description: 'Interrupt a live or abandoned session.',
      promptSnippet: 'session_interrupt — interrupt a session',
      parameters: Type.Object({ id: Type.String({ description: 'Session id.' }) }),
      execute: async (_toolCallId, params, _signal, _onUpdate, ctx) =>
        textResult(await dispatch(ctx, { kind: 'Interrupt', id: params.id })),
    });

    pi.registerTool({
      name: 'session_steer',
      label: 'Steer session',
      description: 'Queue a steering message for a live session.',
      promptSnippet: 'session_steer — steer a live session',
      parameters: Type.Object({
        id: Type.String({ description: 'Session id.' }),
        text: Type.String({ description: 'Steering text.' }),
      }),
      execute: async (_toolCallId, params, _signal, _onUpdate, ctx) =>
        textResult(await dispatch(ctx, { kind: 'Steer', id: params.id, text: params.text })),
    });

    pi.registerTool({
      name: 'session_answer',
      label: 'Answer session',
      description: 'Answer a parked session waiting on a question.',
      promptSnippet: 'session_answer — answer a parked session',
      parameters: Type.Object({
        id: Type.String({ description: 'Session id.' }),
        text: Type.String({ description: 'Answer text.' }),
      }),
      execute: async (_toolCallId, params, _signal, _onUpdate, ctx) =>
        textResult(await dispatch(ctx, { kind: 'Answer', id: params.id, text: params.text })),
    });

    return Promise.resolve();
  };

export default makePiSessionsExtension();
