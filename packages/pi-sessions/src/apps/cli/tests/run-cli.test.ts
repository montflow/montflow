import * as Vitest from '@effect/vitest';
import { Effect, Layer, Schema } from 'effect';
import { Session } from '../../../modules/index.js';
import { SessionRunner, type SessionRunnerImpl } from '../../../services/index.js';
import { runCli } from '../index.js';

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

const layer = (impl: SessionRunnerImpl): Layer.Layer<SessionRunner> =>
  Layer.succeed(SessionRunner, impl);

Vitest.describe('runCli runtime', () => {
  Vitest.it.effect('keeps a quoted multi-word prompt intact (no argv re-join)', () =>
    Effect.gen(function* () {
      let seen = '';
      const sessionRunner = fakeSessionRunner({
        start: (input) =>
          Effect.gen(function* () {
            seen = input.prompt;
            yield* (
              input.onSettled?.({
                session: session('done', 'session-1'),
                events: [],
                receipt: { outcome: 'done', summary: 'ok' },
              }) ?? Effect.void
            );
            return session('running', 'session-1');
          }),
      });
      const text = yield* runCli(
        ['start', '--id', 'session-1', '--prompt', 'fix the bug'],
        '/repo',
      ).pipe(Effect.provide(layer(sessionRunner)));
      Vitest.expect(seen).toBe('fix the bug');
      Vitest.expect(text).toBe("Session 'session-1' done: ok");
    }),
  );

  Vitest.it.effect('keeps a multi-word name intact', () =>
    Effect.gen(function* () {
      let seen = '';
      const sessionRunner = fakeSessionRunner({
        start: (input) =>
          Effect.gen(function* () {
            seen = input.name ?? '';
            yield* (
              input.onSettled?.({
                session: session('done', 'session-1'),
                events: [],
                receipt: { outcome: 'done', summary: 'ok' },
              }) ?? Effect.void
            );
            return session('running', 'session-1');
          }),
      });
      yield* runCli(
        ['start', '--id', 'session-1', '--prompt', 'go', '--name', 'My Session'],
        '/repo',
      ).pipe(Effect.provide(layer(sessionRunner)));
      Vitest.expect(seen).toBe('My Session');
    }),
  );

  Vitest.it.effect('list --status keeps only the named session statuses', () =>
    Effect.gen(function* () {
      const sessionRunner = fakeSessionRunner({
        list: () => Effect.succeed([session('running', 'live'), session('done', 'old')]),
      });
      const text = yield* runCli(['list', '--status', 'running'], '/repo').pipe(
        Effect.provide(layer(sessionRunner)),
      );
      Vitest.expect(text).toContain('live');
      Vitest.expect(text).not.toContain('old');
    }),
  );

  Vitest.it.effect('list --status names the filter when nothing matches', () =>
    Effect.gen(function* () {
      const sessionRunner = fakeSessionRunner({
        list: () => Effect.succeed([session('done', 'old')]),
      });
      const text = yield* runCli(['list', '--status', 'running'], '/repo').pipe(
        Effect.provide(layer(sessionRunner)),
      );
      Vitest.expect(text).toBe("No sessions with status 'running'.");
    }),
  );

  Vitest.it.effect('list --status refuses an unknown status', () =>
    Effect.gen(function* () {
      const sessionRunner = fakeSessionRunner({
        list: () => Effect.succeed([session('running', 'live')]),
      });
      const error = yield* runCli(['list', '--status', 'bogus'], '/repo').pipe(
        Effect.provide(layer(sessionRunner)),
        Effect.flip,
      );
      Vitest.expect(error).toContain("Unknown status 'bogus'");
    }),
  );
});
