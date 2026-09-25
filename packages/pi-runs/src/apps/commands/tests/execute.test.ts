import * as Vitest from '@effect/vitest';
import { Duration, Effect, Layer, Schema } from 'effect';
import { Run, Verify } from '../../../modules/index.js';
import { Runner, type RunnerImpl } from '../../../services/index.js';
import { execute } from '../index.js';

const run = (
  status: Run.Status,
  id: string,
  parent: string | null = null,
  name?: string,
): Run.Run =>
  Schema.decodeUnknownSync(Run.Run)({
    id,
    parent,
    status,
    created: '2026-09-23T00:00:00Z',
    updated: '2026-09-23T00:00:01Z',
    sessionFile: `.agents/@montflow/pi-runs/runs/${id}/session.jsonl`,
    name: name ?? id,
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

const layer = (impl: RunnerImpl): Layer.Layer<Runner> => Layer.succeed(Runner, impl);

Vitest.describe('execute runtime', () => {
  Vitest.it.effect('renders the run list', () =>
    Effect.gen(function* () {
      const text = yield* execute({ kind: 'List' }, '/repo');
      Vitest.expect(text).toBe('run-1  running  One\nrun-2  done  Two  (parent run-1)');
    }).pipe(
      Effect.provide(
        layer(
          fakeRunner({
            list: () =>
              Effect.succeed([
                run('running', 'run-1', null, 'One'),
                run('done', 'run-2', 'run-1', 'Two'),
              ]),
          }),
        ),
      ),
    ),
  );

  Vitest.it.effect('omits a name that equals the id', () =>
    Effect.gen(function* () {
      const text = yield* execute({ kind: 'List' }, '/repo');
      Vitest.expect(text).toBe('run-1  running');
    }).pipe(
      Effect.provide(layer(fakeRunner({ list: () => Effect.succeed([run('running', 'run-1')]) }))),
    ),
  );

  Vitest.it.effect('counts only user/assistant events as turns', () =>
    Effect.gen(function* () {
      const text = yield* execute({ kind: 'Status', id: 'run-1' }, '/repo');
      Vitest.expect(text).toContain('turns 2');
    }).pipe(
      Effect.provide(
        layer(
          fakeRunner({
            detail: () =>
              Effect.succeed({
                run: run('running', 'run-1'),
                events: [
                  { seq: 1, role: 'user', text: 'a', at: 't' },
                  { seq: 2, role: 'assistant', text: 'b', at: 't' },
                  { seq: 3, role: 'system', text: 'c', at: 't' },
                  { seq: 4, role: 'toolResult', text: 'd', at: 't' },
                ],
                receipt: undefined,
              }),
          }),
        ),
      ),
    ),
  );

  Vitest.it.effect('renders status with a receipt', () =>
    Effect.gen(function* () {
      const text = yield* execute({ kind: 'Status', id: 'run-1' }, '/repo');
      Vitest.expect(text).toContain('run-1  done');
      Vitest.expect(text).toContain('turns 0');
      Vitest.expect(text).toContain('receipt done: ok');
    }).pipe(
      Effect.provide(
        layer(
          fakeRunner({
            detail: () =>
              Effect.succeed({
                run: run('done', 'run-1'),
                events: [],
                receipt: { outcome: 'done', summary: 'ok' },
              }),
          }),
        ),
      ),
    ),
  );

  Vitest.it.effect('renders a verify verdict', () =>
    Effect.gen(function* () {
      const text = yield* execute({ kind: 'Verify', id: 'run-1' }, '/repo');
      Vitest.expect(text).toContain('valid yes');
      Vitest.expect(text).toContain('resumable no');
    }).pipe(
      Effect.provide(
        layer(
          fakeRunner({
            verify: () =>
              Effect.succeed({
                valid: true,
                resumable: false,
                issues: [],
              } satisfies Verify.VerifyResult),
          }),
        ),
      ),
    ),
  );

  Vitest.it.effect('start waits for settlement and reports the outcome', () =>
    Effect.gen(function* () {
      const text = yield* execute(
        {
          kind: 'Start',
          id: 'run-1',
          prompt: 'go',
          name: undefined,
          model: undefined,
          parent: undefined,
          related: undefined,
          tools: undefined,
        },
        '/repo',
      );
      Vitest.expect(text).toBe("Run 'run-1' done: finished");
    }).pipe(
      Effect.provide(
        layer(
          fakeRunner({
            start: (input) =>
              input.onSettled === undefined
                ? Effect.fail('missing hook')
                : input
                    .onSettled({
                      run: run('done', 'run-1'),
                      events: [],
                      receipt: { outcome: 'done', summary: 'finished' },
                    })
                    .pipe(Effect.as(run('running', 'run-1'))),
          }),
        ),
      ),
    ),
  );

  Vitest.it.effect('detach start returns immediately without settling', () =>
    Effect.gen(function* () {
      const text = yield* execute(
        {
          kind: 'Start',
          id: 'run-1',
          prompt: 'go',
          name: undefined,
          model: undefined,
          parent: undefined,
          related: undefined,
          tools: undefined,
        },
        '/repo',
        { startMode: 'detach' },
      );
      Vitest.expect(text).toBe("Run 'run-1' started.");
    }).pipe(
      Effect.provide(
        layer(
          fakeRunner({
            // Never settles: a parked/dead run must not block the caller.
            start: () => Effect.succeed(run('running', 'run-1')),
          }),
        ),
      ),
    ),
  );

  Vitest.it.live('await start times out instead of hanging forever', () =>
    Effect.gen(function* () {
      const text = yield* execute(
        {
          kind: 'Start',
          id: 'run-1',
          prompt: 'go',
          name: undefined,
          model: undefined,
          parent: undefined,
          related: undefined,
          tools: undefined,
        },
        '/repo',
        { settlementTimeout: Duration.millis(10) },
      );
      Vitest.expect(text).toBe("Run 'run-1' still running; check its status.");
    }).pipe(
      Effect.provide(layer(fakeRunner({ start: () => Effect.succeed(run('running', 'run-1')) }))),
    ),
  );

  Vitest.it.effect('invokes the completion hook seam on settlement', () =>
    Effect.gen(function* () {
      let hooked = false;
      yield* execute(
        {
          kind: 'Start',
          id: 'run-1',
          prompt: 'go',
          name: undefined,
          model: undefined,
          parent: undefined,
          related: undefined,
          tools: undefined,
        },
        '/repo',
        {
          onSettled: () =>
            Effect.sync(() => {
              hooked = true;
            }),
        },
      );
      Vitest.expect(hooked).toBe(true);
    }).pipe(
      Effect.provide(
        layer(
          fakeRunner({
            start: (input) =>
              (
                input.onSettled?.({
                  run: run('done', 'run-1'),
                  events: [],
                  receipt: { outcome: 'done', summary: 'ok' },
                }) ?? Effect.void
              ).pipe(Effect.as(run('running', 'run-1'))),
          }),
        ),
      ),
    ),
  );

  Vitest.it.effect('resume delegates to the engine', () =>
    Effect.gen(function* () {
      const text = yield* execute({ kind: 'Resume', id: 'run-1', prompt: 'again' }, '/repo');
      Vitest.expect(text).toBe("Resumed 'run-1'.");
    }).pipe(
      Effect.provide(
        layer(
          fakeRunner({
            resume: (_root, id) => Effect.succeed(run('running', id)),
          }),
        ),
      ),
    ),
  );

  Vitest.it.effect('interrupt delegates to the engine', () => {
    let interrupted = '';
    return Effect.gen(function* () {
      const text = yield* execute({ kind: 'Interrupt', id: 'run-1' }, '/repo');
      Vitest.expect(text).toBe("Interrupted 'run-1'.");
      Vitest.expect(interrupted).toBe('run-1');
    }).pipe(
      Effect.provide(
        layer(
          fakeRunner({
            interrupt: (_root, id) =>
              Effect.sync(() => {
                interrupted = id;
              }),
          }),
        ),
      ),
    );
  });
});
