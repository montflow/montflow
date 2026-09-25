import * as Vitest from '@effect/vitest';
import { Duration, Effect, Layer, Schema } from 'effect';
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import {
  COMMAND_NAME,
  makePiRunsExtension,
  type PiRunsExtensionOptions,
  type SurfaceContext,
} from '../extension.js';
import { Run } from '../modules/index.js';
import { Runner, type RunDetail, type RunnerImpl } from '../services/index.js';

const run = (status: Run.Status, id: string): Run.Run =>
  Schema.decodeUnknownSync(Run.Run)({
    id,
    parent: null,
    status,
    created: '2026-09-23T00:00:00Z',
    updated: '2026-09-23T00:00:01Z',
    sessionFile: `.agents/@montflow/pi-runs/runs/${id}/session.jsonl`,
    name: id,
  });

const fakeRunner = (overrides: Partial<RunnerImpl>): RunnerImpl => ({
  start: () => Effect.fail('unused'),
  resume: () => Effect.fail('unused'),
  steer: () => Effect.void,
  answer: () => Effect.void,
  interrupt: () => Effect.void,
  detail: () => Effect.fail('unused'),
  verify: () => Effect.fail('unused'),
  progress: () => Effect.void,
  list: () => Effect.succeed([]),
  ...overrides,
});

interface RegisteredCommand {
  readonly name: string;
  readonly options: {
    readonly description?: string;
    readonly handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
  };
}

interface FakePi {
  readonly commands: Array<RegisteredCommand>;
  readonly tools: Array<ToolDefinition>;
  readonly handlers: Map<string, () => Promise<void> | void>;
  readonly api: Pick<ExtensionAPI, 'registerCommand' | 'registerTool' | 'on'>;
}

const makePi = (): FakePi => {
  const commands: Array<RegisteredCommand> = [];
  const tools: Array<ToolDefinition> = [];
  const handlers = new Map<string, () => Promise<void> | void>();
  // SAFETY: the fake implements only the ExtensionAPI members the extension
  // calls; `on` is narrowed to the shutdown-handler shape under test.
  const api = {
    registerCommand: (name: string, options: RegisteredCommand['options']) => {
      commands.push({ name, options });
    },
    registerTool: (definition: ToolDefinition) => {
      tools.push(definition);
    },
    on: (event: string, handler: () => Promise<void> | void) => {
      handlers.set(event, handler);
    },
  } as Pick<ExtensionAPI, 'registerCommand' | 'registerTool' | 'on'>;
  return { commands, tools, handlers, api };
};

const surface = (cwd = '/repo'): SurfaceContext => ({ cwd, ui: { notify: () => undefined } });

// SAFETY: the extension's tools only read `ctx.cwd`/`ctx.ui`, so the structural
// SurfaceContext is a faithful stand-in for the full Pi context under test.
const context = (cwd = '/repo'): ExtensionContext => surface(cwd) as ExtensionContext;

/** A context that records every notification it receives, tagged by session. */
const recordingContext = (cwd: string, tag: string, seen: Array<string>): ExtensionContext => {
  const surfaceCtx: SurfaceContext = {
    cwd,
    ui: {
      notify: (message) => {
        seen.push(`${tag}:${message}`);
      },
    },
  };
  // SAFETY: the extension's tools only read `ctx.cwd`/`ctx.ui`, so the
  // structural SurfaceContext is a faithful stand-in for the full Pi context.
  return surfaceCtx as ExtensionContext;
};

const tool = (fake: FakePi, name: string): ToolDefinition => {
  const found = fake.tools.find((entry) => entry.name === name);
  if (found === undefined) throw new Error(`tool not registered: ${name}`);
  return found;
};

const extension = (impl: RunnerImpl, options: PiRunsExtensionOptions = {}) =>
  makePiRunsExtension({
    runnerLayerFor: () => Layer.succeed(Runner, impl),
    ...options,
  });

Vitest.describe('piRunsExtension runtime', () => {
  Vitest.it.effect('registers /mf-runs and the run tools with full options', () =>
    Effect.promise(async () => {
      const fake = makePi();
      await extension(fakeRunner({}))(fake.api);
      Vitest.expect(fake.commands.map((entry) => entry.name)).toStrictEqual([COMMAND_NAME]);
      Vitest.expect(fake.commands[0]?.options.description).toBeDefined();
      Vitest.expect(fake.commands[0]?.options.handler).toBeDefined();
      Vitest.expect(fake.tools.map((entry) => entry.name)).toStrictEqual([
        'run_start',
        'run_status',
        'run_verify',
        'run_list',
        'run_resume',
        'run_interrupt',
        'run_steer',
        'run_answer',
      ]);
      for (const definition of fake.tools) {
        Vitest.expect(definition.parameters, `${definition.name} parameters`).toBeDefined();
        Vitest.expect(definition.description, `${definition.name} description`).toBeTruthy();
        Vitest.expect(definition.promptSnippet, `${definition.name} snippet`).toBeTruthy();
        Vitest.expect(definition.execute, `${definition.name} execute`).toBeDefined();
      }
    }),
  );

  Vitest.it.effect('run_start is fire-and-forget (does not await settlement)', () =>
    Effect.promise(async () => {
      const fake = makePi();
      await extension(fakeRunner({ start: () => Effect.succeed(run('running', 'run-1')) }))(
        fake.api,
      );
      const result = await tool(fake, 'run_start').execute(
        'call-1',
        { id: 'run-1', prompt: 'go' },
        undefined,
        undefined,
        context(),
      );
      Vitest.expect(result.content).toStrictEqual([{ type: 'text', text: "Run 'run-1' started." }]);
    }),
  );

  Vitest.it.effect('run_start forwards the abort signal to interrupt', () =>
    Effect.promise(async () => {
      const fake = makePi();
      const interrupted: Array<string> = [];
      await extension(
        fakeRunner({
          start: () => Effect.succeed(run('running', 'run-1')),
          interrupt: (_root, id) =>
            Effect.sync(() => {
              interrupted.push(id);
            }),
        }),
      )(fake.api);
      const controller = new AbortController();
      await tool(fake, 'run_start').execute(
        'call-1',
        { id: 'run-1', prompt: 'go' },
        controller.signal,
        undefined,
        context(),
      );
      controller.abort();
      await Effect.sleep(Duration.millis(1)).pipe(Effect.runPromise);
      Vitest.expect(interrupted).toStrictEqual(['run-1']);
    }),
  );

  Vitest.it.effect('routes status, resume, interrupt, steer, and answer', () =>
    Effect.promise(async () => {
      const fake = makePi();
      const calls: Array<string> = [];
      await extension(
        fakeRunner({
          detail: (_root, id) =>
            Effect.succeed({
              run: run('running', id),
              events: [],
              receipt: undefined,
            }),
          resume: (_root, id) => Effect.succeed(run('running', id)),
          interrupt: (_root, id) =>
            Effect.sync(() => {
              calls.push(`interrupt:${id}`);
            }),
          steer: (_root, id) =>
            Effect.sync(() => {
              calls.push(`steer:${id}`);
            }),
          answer: (_root, id) =>
            Effect.sync(() => {
              calls.push(`answer:${id}`);
            }),
        }),
      )(fake.api);
      const ctx = context();
      await tool(fake, 'run_status').execute('c', { id: 'run-1' }, undefined, undefined, ctx);
      await tool(fake, 'run_resume').execute('c', { id: 'run-1' }, undefined, undefined, ctx);
      await tool(fake, 'run_interrupt').execute('c', { id: 'run-1' }, undefined, undefined, ctx);
      await tool(fake, 'run_steer').execute(
        'c',
        { id: 'run-1', text: 'left' },
        undefined,
        undefined,
        ctx,
      );
      await tool(fake, 'run_answer').execute(
        'c',
        { id: 'run-1', text: 'yes' },
        undefined,
        undefined,
        ctx,
      );
      Vitest.expect(calls).toStrictEqual(['interrupt:run-1', 'steer:run-1', 'answer:run-1']);
    }),
  );

  Vitest.it.effect('session_shutdown interrupts live runs and disposes runtimes', () =>
    Effect.promise(async () => {
      const fake = makePi();
      const interrupted: Array<string> = [];
      await extension(
        fakeRunner({
          list: () =>
            Effect.succeed([
              run('running', 'live'),
              run('awaiting-input', 'parked'),
              run('done', 'old'),
            ]),
          interrupt: (_root, id) =>
            Effect.sync(() => {
              interrupted.push(id);
            }),
        }),
      )(fake.api);
      await tool(fake, 'run_list').execute('c', {}, undefined, undefined, context());
      await fake.handlers.get('session_shutdown')?.();
      Vitest.expect(interrupted).toStrictEqual(['live', 'parked']);
    }),
  );

  Vitest.it.effect('invokes the E001 completion hook seam on settlement', () =>
    Effect.promise(async () => {
      const fake = makePi();
      let hooked = false;
      await extension(
        fakeRunner({
          start: (input) =>
            Effect.gen(function* () {
              yield* (
                input.onSettled?.({
                  run: run('done', 'run-1'),
                  events: [],
                  receipt: { outcome: 'done', summary: 'ok' },
                }) ?? Effect.void
              );
              return run('running', 'run-1');
            }),
        }),
        {
          onSettled: () =>
            Effect.sync(() => {
              hooked = true;
            }),
        },
      )(fake.api);
      await tool(fake, 'run_start').execute(
        'c',
        { id: 'run-1', prompt: 'go' },
        undefined,
        undefined,
        context(),
      );
      Vitest.expect(hooked).toBe(true);
    }),
  );

  Vitest.it.effect('binds a run completion notice to its dispatching context', () =>
    Effect.promise(async () => {
      const fake = makePi();
      let settle: ((detail: RunDetail) => Effect.Effect<void>) | undefined;
      await extension(
        fakeRunner({
          start: (input) => {
            settle = input.onSettled;
            return Effect.succeed(run('running', 'run-1'));
          },
        }),
      )(fake.api);
      const seen: Array<string> = [];
      const ctxA = recordingContext('/repo-a', 'a', seen);
      const ctxB = recordingContext('/repo-b', 'b', seen);
      await tool(fake, 'run_start').execute(
        'c',
        { id: 'run-1', prompt: 'go' },
        undefined,
        undefined,
        ctxA,
      );
      // A later dispatch from another session must not steal the completion notice.
      await tool(fake, 'run_status').execute('c', { id: 'run-1' }, undefined, undefined, ctxB);
      await (
        settle?.({
          run: run('done', 'run-1'),
          events: [],
          receipt: { outcome: 'done', summary: 'ok' },
        }) ?? Effect.void
      ).pipe(Effect.runPromise);
      Vitest.expect(seen).toStrictEqual(["a:Run 'run-1' done: ok"]);
    }),
  );
});
