import * as Vitest from '@effect/vitest';
import { Effect, Layer, Schema } from 'effect';
import { Run } from '../../../modules/index.js';
import { Runner, type RunnerImpl } from '../../../services/index.js';
import { runCli } from '../index.js';

const run = (status: Run.Status, id: string): Run.Run =>
  Schema.decodeUnknownSync(Run.Run)({
    id,
    parent: null,
    status,
    created: '2026-09-23T00:00:00Z',
    updated: '2026-09-23T00:00:01Z',
    sessionFile: `.agents/@montflow/runs/${id}/session.jsonl`,
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
  verifyStore: () => Effect.succeed({ ignored: true, issues: [] }),
  progress: () => Effect.void,
  list: () => Effect.succeed([]),
  liveRunIds: () => Effect.succeed(new Set()),
  ...overrides,
});

const layer = (impl: RunnerImpl): Layer.Layer<Runner> => Layer.succeed(Runner, impl);

Vitest.describe('runCli runtime', () => {
  Vitest.it.effect('keeps a quoted multi-word prompt intact (no argv re-join)', () =>
    Effect.gen(function* () {
      let seen = '';
      const runner = fakeRunner({
        start: (input) =>
          Effect.gen(function* () {
            seen = input.prompt;
            yield* (
              input.onSettled?.({
                run: run('done', 'run-1'),
                events: [],
                receipt: { outcome: 'done', summary: 'ok' },
              }) ?? Effect.void
            );
            return run('running', 'run-1');
          }),
      });
      const text = yield* runCli(
        ['start', '--id', 'run-1', '--prompt', 'fix the bug'],
        '/repo',
      ).pipe(Effect.provide(layer(runner)));
      Vitest.expect(seen).toBe('fix the bug');
      Vitest.expect(text).toBe("Run 'run-1' done: ok");
    }),
  );

  Vitest.it.effect('keeps a multi-word name intact', () =>
    Effect.gen(function* () {
      let seen = '';
      const runner = fakeRunner({
        start: (input) =>
          Effect.gen(function* () {
            seen = input.name ?? '';
            yield* (
              input.onSettled?.({
                run: run('done', 'run-1'),
                events: [],
                receipt: { outcome: 'done', summary: 'ok' },
              }) ?? Effect.void
            );
            return run('running', 'run-1');
          }),
      });
      yield* runCli(['start', '--id', 'run-1', '--prompt', 'go', '--name', 'My Run'], '/repo').pipe(
        Effect.provide(layer(runner)),
      );
      Vitest.expect(seen).toBe('My Run');
    }),
  );

  Vitest.it.effect('list --status keeps only the named run statuses', () =>
    Effect.gen(function* () {
      const runner = fakeRunner({
        list: () => Effect.succeed([run('running', 'live'), run('done', 'old')]),
      });
      const text = yield* runCli(['list', '--status', 'running'], '/repo').pipe(
        Effect.provide(layer(runner)),
      );
      Vitest.expect(text).toContain('live');
      Vitest.expect(text).not.toContain('old');
    }),
  );

  Vitest.it.effect('list --status names the filter when nothing matches', () =>
    Effect.gen(function* () {
      const runner = fakeRunner({ list: () => Effect.succeed([run('done', 'old')]) });
      const text = yield* runCli(['list', '--status', 'running'], '/repo').pipe(
        Effect.provide(layer(runner)),
      );
      Vitest.expect(text).toBe("No runs with status 'running'.");
    }),
  );

  Vitest.it.effect('list --status refuses an unknown status', () =>
    Effect.gen(function* () {
      const runner = fakeRunner({ list: () => Effect.succeed([run('running', 'live')]) });
      const error = yield* runCli(['list', '--status', 'bogus'], '/repo').pipe(
        Effect.provide(layer(runner)),
        Effect.flip,
      );
      Vitest.expect(error).toContain("Unknown status 'bogus'");
    }),
  );
});
