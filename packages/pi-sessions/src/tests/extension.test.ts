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
  makePiSessionsExtension,
  type PiSessionsExtensionOptions,
  type SurfaceContext,
} from '../extension.js';
import { Session } from '../modules/index.js';
import { SessionRunner, type SessionDetail, type SessionRunnerImpl } from '../services/index.js';

const session = (status: Session.Status, id: string): Session.Session =>
  Schema.decodeUnknownSync(Session.Session)({
    id,
    parent: null,
    status,
    created: '2026-09-23T00:00:00Z',
    updated: '2026-09-23T00:00:01Z',
    sessionFile: `.agents/@montflow/sessions/${id}/session.jsonl`,
    name: id,
  });

const fakeSessionRunner = (overrides: Partial<SessionRunnerImpl>): SessionRunnerImpl => ({
  start: () => Effect.fail('unused'),
  resume: () => Effect.fail('unused'),
  steer: () => Effect.void,
  answer: () => Effect.void,
  interrupt: () => Effect.void,
  detail: () => Effect.fail('unused'),
  verify: () => Effect.fail('unused'),
  verifyStore: () => Effect.succeed({ ignored: true, issues: [] }),
  progress: () => Effect.void,
  list: () => Effect.succeed([]),
  liveSessionIds: () => Effect.succeed(new Set()),
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

const extension = (impl: SessionRunnerImpl, options: PiSessionsExtensionOptions = {}) =>
  makePiSessionsExtension({
    sessionRunnerLayerFor: () => Layer.succeed(SessionRunner, impl),
    ...options,
  });

Vitest.describe('piSessionsExtension runtime', () => {
  Vitest.it.effect('registers /mf-sessions and the session tools with full options', () =>
    Effect.promise(async () => {
      const fake = makePi();
      await extension(fakeSessionRunner({}))(fake.api);
      Vitest.expect(fake.commands.map((entry) => entry.name)).toStrictEqual([COMMAND_NAME]);
      Vitest.expect(fake.commands[0]?.options.description).toBeDefined();
      Vitest.expect(fake.commands[0]?.options.handler).toBeDefined();
      Vitest.expect(fake.tools.map((entry) => entry.name)).toStrictEqual([
        'session_start',
        'session_status',
        'session_verify',
        'session_list',
        'session_resume',
        'session_interrupt',
        'session_steer',
        'session_answer',
      ]);
      for (const definition of fake.tools) {
        Vitest.expect(definition.parameters, `${definition.name} parameters`).toBeDefined();
        Vitest.expect(definition.description, `${definition.name} description`).toBeTruthy();
        Vitest.expect(definition.promptSnippet, `${definition.name} snippet`).toBeTruthy();
        Vitest.expect(definition.execute, `${definition.name} execute`).toBeDefined();
      }
    }),
  );

  Vitest.it.effect('session_start is fire-and-forget (does not await settlement)', () =>
    Effect.promise(async () => {
      const fake = makePi();
      await extension(
        fakeSessionRunner({ start: () => Effect.succeed(session('running', 'session-1')) }),
      )(fake.api);
      const result = await tool(fake, 'session_start').execute(
        'call-1',
        { id: 'session-1', prompt: 'go' },
        undefined,
        undefined,
        context(),
      );
      Vitest.expect(result.content).toStrictEqual([
        { type: 'text', text: "Session 'session-1' started." },
      ]);
    }),
  );

  Vitest.it.effect('session_start forwards the abort signal to interrupt', () =>
    Effect.promise(async () => {
      const fake = makePi();
      const interrupted: Array<string> = [];
      await extension(
        fakeSessionRunner({
          start: () => Effect.succeed(session('running', 'session-1')),
          interrupt: (_root, id) =>
            Effect.sync(() => {
              interrupted.push(id);
            }),
        }),
      )(fake.api);
      const controller = new AbortController();
      await tool(fake, 'session_start').execute(
        'call-1',
        { id: 'session-1', prompt: 'go' },
        controller.signal,
        undefined,
        context(),
      );
      controller.abort();
      await Effect.sleep(Duration.millis(1)).pipe(Effect.runPromise);
      Vitest.expect(interrupted).toStrictEqual(['session-1']);
    }),
  );

  Vitest.it.effect('routes status, resume, interrupt, steer, and answer', () =>
    Effect.promise(async () => {
      const fake = makePi();
      const calls: Array<string> = [];
      await extension(
        fakeSessionRunner({
          detail: (_root, id) =>
            Effect.succeed({
              session: session('running', id),
              events: [],
              receipt: undefined,
            }),
          resume: (_root, id) => Effect.succeed(session('running', id)),
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
      await tool(fake, 'session_status').execute(
        'c',
        { id: 'session-1' },
        undefined,
        undefined,
        ctx,
      );
      await tool(fake, 'session_resume').execute(
        'c',
        { id: 'session-1' },
        undefined,
        undefined,
        ctx,
      );
      await tool(fake, 'session_interrupt').execute(
        'c',
        { id: 'session-1' },
        undefined,
        undefined,
        ctx,
      );
      await tool(fake, 'session_steer').execute(
        'c',
        { id: 'session-1', text: 'left' },
        undefined,
        undefined,
        ctx,
      );
      await tool(fake, 'session_answer').execute(
        'c',
        { id: 'session-1', text: 'yes' },
        undefined,
        undefined,
        ctx,
      );
      Vitest.expect(calls).toStrictEqual([
        'interrupt:session-1',
        'steer:session-1',
        'answer:session-1',
      ]);
    }),
  );

  Vitest.it.effect('session_shutdown interrupts live sessions and disposes runtimes', () =>
    Effect.promise(async () => {
      const fake = makePi();
      const interrupted: Array<string> = [];
      await extension(
        fakeSessionRunner({
          list: () =>
            Effect.succeed([
              session('running', 'live'),
              session('awaiting-input', 'parked'),
              session('done', 'old'),
            ]),
          interrupt: (_root, id) =>
            Effect.sync(() => {
              interrupted.push(id);
            }),
        }),
      )(fake.api);
      await tool(fake, 'session_list').execute('c', {}, undefined, undefined, context());
      await fake.handlers.get('session_shutdown')?.();
      Vitest.expect(interrupted).toStrictEqual(['live', 'parked']);
    }),
  );

  Vitest.it.effect('invokes the E001 completion hook seam on settlement', () =>
    Effect.promise(async () => {
      const fake = makePi();
      let hooked = false;
      await extension(
        fakeSessionRunner({
          start: (input) =>
            Effect.gen(function* () {
              yield* (
                input.onSettled?.({
                  session: session('done', 'session-1'),
                  events: [],
                  receipt: { outcome: 'done', summary: 'ok' },
                }) ?? Effect.void
              );
              return session('running', 'session-1');
            }),
        }),
        {
          onSettled: () =>
            Effect.sync(() => {
              hooked = true;
            }),
        },
      )(fake.api);
      await tool(fake, 'session_start').execute(
        'c',
        { id: 'session-1', prompt: 'go' },
        undefined,
        undefined,
        context(),
      );
      Vitest.expect(hooked).toBe(true);
    }),
  );

  Vitest.it.effect('binds a session completion notice to its dispatching context', () =>
    Effect.promise(async () => {
      const fake = makePi();
      let settle: ((detail: SessionDetail) => Effect.Effect<void>) | undefined;
      await extension(
        fakeSessionRunner({
          start: (input) => {
            settle = input.onSettled;
            return Effect.succeed(session('running', 'session-1'));
          },
        }),
      )(fake.api);
      const seen: Array<string> = [];
      const ctxA = recordingContext('/repo-a', 'a', seen);
      const ctxB = recordingContext('/repo-b', 'b', seen);
      await tool(fake, 'session_start').execute(
        'c',
        { id: 'session-1', prompt: 'go' },
        undefined,
        undefined,
        ctxA,
      );
      // A later dispatch from another session must not steal the completion notice.
      await tool(fake, 'session_status').execute(
        'c',
        { id: 'session-1' },
        undefined,
        undefined,
        ctxB,
      );
      await (
        settle?.({
          session: session('done', 'session-1'),
          events: [],
          receipt: { outcome: 'done', summary: 'ok' },
        }) ?? Effect.void
      ).pipe(Effect.runPromise);
      Vitest.expect(seen).toStrictEqual(["a:Session 'session-1' done: ok"]);
    }),
  );
});
