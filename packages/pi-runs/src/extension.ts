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
import { createRunnerHost, runnerLayer } from './apps/runtime/index.js';
import { Runner, type RunDetail, WorkspaceBridge } from './services/index.js';

/**
 * Pi extension: `/mf-runs` plus agent-callable tools over the run engine.
 * The engine's live-run registry persists for the extension's lifetime, so
 * `steer`/`answer` reach runs started in the same Pi session.
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
export interface PiRunsExtensionOptions {
  /** Build the runner layer for a repo root; defaults to the real file-backed layer. */
  readonly runnerLayerFor?: (
    root: string,
    bridge: Layer.Layer<WorkspaceBridge>,
  ) => Layer.Layer<Runner>;
  /**
   * A004 completion seam: invoked once per settled run with the dispatching
   * context. E001 composes the `/mf-profiles-cli create` invocation here; Phase
   * C only guarantees the seam and the per-run completion notification.
   */
  readonly onSettled?: (detail: RunDetail, ctx: SurfaceContext) => Effect.Effect<void>;
}

/** Pi's notify channel has no success variant; success rides the info channel. */
const notifyType = (variant: 'info' | 'success' | 'error' | undefined): 'info' | 'error' =>
  variant === 'error' ? 'error' : 'info';

/** Tool result shape for a rendered command output. */
const textResult = (text: string) => ({
  content: [{ type: 'text' as const, text }],
  details: {},
});

/** Per-run completion notification, bound to the dispatching context. */
const completionNotice = (ctx: SurfaceContext, detail: RunDetail): Effect.Effect<void> =>
  Effect.sync(() => {
    const outcome = detail.receipt?.outcome ?? 'done';
    const summary = detail.receipt?.summary ?? '';
    ctx.ui.notify(
      `Run '${detail.run.id}' ${outcome}: ${summary}`.trim(),
      outcome === 'failed' ? 'error' : 'info',
    );
  });

/**
 * Pi extension entry: registers `/mf-runs` and the run tools. One runner
 * runtime is built per repo root, so live runs persist across commands/tools
 * and stay rooted in their own repository.
 * @param options - test seam and the E001 completion hook
 * @returns the extension factory Pi invokes with its API
 */
export const makePiRunsExtension =
  (options: PiRunsExtensionOptions = {}) =>
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

    const host = createRunnerHost({
      layerFor: options.runnerLayerFor ?? ((root, bridge) => runnerLayer({ root, bridge })),
      bridgeFor,
    });

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
    const settledHook = (ctx: SurfaceContext, detail: RunDetail): Effect.Effect<void> =>
      Effect.gen(function* () {
        yield* completionNotice(ctx, detail);
        if (options.onSettled !== undefined) yield* options.onSettled(detail, ctx);
      });

    /** Interrupt a single run through its root's runtime. */
    const interruptRun = (root: string, id: string): Promise<void> =>
      host
        .runtimeFor(root)
        .runPromise(
          Effect.gen(function* () {
            const runner = yield* Runner;
            yield* runner.interrupt(root, id).pipe(Effect.catch(() => Effect.void));
          }),
        )
        .catch(() => undefined);

    /** On shutdown, cancel every live run, then dispose every runtime. */
    const shutdown = async (): Promise<void> => {
      await Promise.all(
        Array.from(contexts.keys(), (root) =>
          host
            .runtimeFor(root)
            .runPromise(
              Effect.gen(function* () {
                const runner = yield* Runner;
                const runs = yield* runner.list(root).pipe(Effect.orElseSucceed(() => []));
                yield* Effect.forEach(
                  runs.filter((run) => run.status === 'running' || run.status === 'awaiting-input'),
                  (run) => runner.interrupt(root, run.id).pipe(Effect.catch(() => Effect.void)),
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
      name: 'run_start',
      label: 'Start run',
      description:
        'Start a local agent run for the given id and prompt. Returns as soon as the run is started; use run_status/run_steer/run_answer to follow it. Optionally set a parent run, related run ids, a model, or a tool allowlist.',
      promptSnippet: 'run_start — start a local agent run',
      parameters: Type.Object({
        id: Type.String({ description: 'Directory-safe run id.' }),
        prompt: Type.String({ description: 'The prompt for the run.' }),
        name: Type.Optional(Type.String({ description: 'Display name.' })),
        model: Type.Optional(Type.String({ description: 'provider/model-id pin.' })),
        parent: Type.Optional(Type.String({ description: 'Parent run id.' })),
        related: Type.Optional(Type.Array(Type.String(), { description: 'Related run ids.' })),
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
            model: params.model,
            parent: params.parent,
            related: params.related,
            tools: params.tools,
          },
          {
            startMode: 'detach',
            onSettled: (detail) => settledHook(surface, detail),
          },
        );
        signal?.addEventListener('abort', () => void interruptRun(surface.cwd, params.id), {
          once: true,
        });
        return textResult(text);
      },
    });

    pi.registerTool({
      name: 'run_status',
      label: 'Run status',
      description: 'Show one run: status, turn count, and receipt.',
      promptSnippet: 'run_status — show a run',
      parameters: Type.Object({ id: Type.String({ description: 'Run id.' }) }),
      execute: async (_toolCallId, params, _signal, _onUpdate, ctx) =>
        textResult(await dispatch(ctx, { kind: 'Status', id: params.id })),
    });

    pi.registerTool({
      name: 'run_verify',
      label: 'Verify run',
      description: 'Mechanically verify a run: validity and resumability.',
      promptSnippet: 'run_verify — verify a run is valid and resumable',
      parameters: Type.Object({ id: Type.String({ description: 'Run id.' }) }),
      execute: async (_toolCallId, params, _signal, _onUpdate, ctx) =>
        textResult(await dispatch(ctx, { kind: 'Verify', id: params.id })),
    });

    pi.registerTool({
      name: 'run_list',
      label: 'List runs',
      description: 'List local runs.',
      promptSnippet: 'run_list — list local runs',
      parameters: Type.Object({}),
      execute: async (_toolCallId, _params, _signal, _onUpdate, ctx) =>
        textResult(await dispatch(ctx, { kind: 'List' })),
    });

    pi.registerTool({
      name: 'run_resume',
      label: 'Resume run',
      description: 'Resume a valid, resumable run, optionally with a new prompt.',
      promptSnippet: 'run_resume — resume a run',
      parameters: Type.Object({
        id: Type.String({ description: 'Run id.' }),
        prompt: Type.Optional(Type.String({ description: 'Optional prompt to continue with.' })),
      }),
      execute: async (_toolCallId, params, _signal, _onUpdate, ctx) =>
        textResult(await dispatch(ctx, { kind: 'Resume', id: params.id, prompt: params.prompt })),
    });

    pi.registerTool({
      name: 'run_interrupt',
      label: 'Interrupt run',
      description: 'Interrupt a live or abandoned run.',
      promptSnippet: 'run_interrupt — interrupt a run',
      parameters: Type.Object({ id: Type.String({ description: 'Run id.' }) }),
      execute: async (_toolCallId, params, _signal, _onUpdate, ctx) =>
        textResult(await dispatch(ctx, { kind: 'Interrupt', id: params.id })),
    });

    pi.registerTool({
      name: 'run_steer',
      label: 'Steer run',
      description: 'Queue a steering message for a live run.',
      promptSnippet: 'run_steer — steer a live run',
      parameters: Type.Object({
        id: Type.String({ description: 'Run id.' }),
        text: Type.String({ description: 'Steering text.' }),
      }),
      execute: async (_toolCallId, params, _signal, _onUpdate, ctx) =>
        textResult(await dispatch(ctx, { kind: 'Steer', id: params.id, text: params.text })),
    });

    pi.registerTool({
      name: 'run_answer',
      label: 'Answer run',
      description: 'Answer a parked run waiting on a question.',
      promptSnippet: 'run_answer — answer a parked run',
      parameters: Type.Object({
        id: Type.String({ description: 'Run id.' }),
        text: Type.String({ description: 'Answer text.' }),
      }),
      execute: async (_toolCallId, params, _signal, _onUpdate, ctx) =>
        textResult(await dispatch(ctx, { kind: 'Answer', id: params.id, text: params.text })),
    });

    return Promise.resolve();
  };

export default makePiRunsExtension();
