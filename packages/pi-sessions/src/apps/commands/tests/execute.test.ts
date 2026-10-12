import * as Vitest from '@effect/vitest';
import { Duration, Effect, Layer, Schema } from 'effect';
import { Session, Verify } from '../../../modules/index.js';
import { SessionRunner, type SessionRunnerImpl } from '../../../services/index.js';
import { execute } from '../index.js';

const session = (
  status: Session.Status,
  id: string,
  parent: string | null = null,
  name?: string,
): Session.Session =>
  Schema.decodeUnknownSync(Session.Session)({
    id,
    parent,
    status,
    created: '2026-09-23T00:00:00Z',
    updated: '2026-09-23T00:00:01Z',
    sessionFile: `.agents/@montflow/sessions/${id}/session.jsonl`,
    name: name ?? id,
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

Vitest.describe('execute runtime', () => {
  Vitest.it.effect('renders the session list', () =>
    Effect.gen(function* () {
      const text = yield* execute({ kind: 'List', status: undefined }, '/repo');
      Vitest.expect(text).toBe('session-1  running  One\nsession-2  done  Two  (parent session-1)');
    }).pipe(
      Effect.provide(
        layer(
          fakeSessionRunner({
            list: () =>
              Effect.succeed([
                session('running', 'session-1', null, 'One'),
                session('done', 'session-2', 'session-1', 'Two'),
              ]),
          }),
        ),
      ),
    ),
  );

  Vitest.it.effect('omits a name that equals the id', () =>
    Effect.gen(function* () {
      const text = yield* execute({ kind: 'List', status: undefined }, '/repo');
      Vitest.expect(text).toBe('session-1  running');
    }).pipe(
      Effect.provide(
        layer(fakeSessionRunner({ list: () => Effect.succeed([session('running', 'session-1')]) })),
      ),
    ),
  );

  Vitest.it.effect('counts only user/assistant events as turns', () =>
    Effect.gen(function* () {
      const text = yield* execute({ kind: 'Status', id: 'session-1' }, '/repo');
      Vitest.expect(text).toContain('turns 2');
    }).pipe(
      Effect.provide(
        layer(
          fakeSessionRunner({
            detail: () =>
              Effect.succeed({
                session: session('running', 'session-1'),
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

  Vitest.it.effect('renders status with a receipt and the store ignore verdict', () =>
    Effect.gen(function* () {
      const text = yield* execute({ kind: 'Status', id: 'session-1' }, '/repo');
      Vitest.expect(text).toContain('session-1  done');
      Vitest.expect(text).toContain('turns 0');
      Vitest.expect(text).toContain('receipt done: ok');
      Vitest.expect(text).toContain('store ignored: yes');
    }).pipe(
      Effect.provide(
        layer(
          fakeSessionRunner({
            detail: () =>
              Effect.succeed({
                session: session('done', 'session-1'),
                events: [],
                receipt: { outcome: 'done', summary: 'ok' },
              }),
          }),
        ),
      ),
    ),
  );

  Vitest.it.effect('reports a store that git would track', () =>
    Effect.gen(function* () {
      const text = yield* execute({ kind: 'Status', id: 'session-1' }, '/repo');
      Vitest.expect(text).toContain('store ignored: no');
      Vitest.expect(text).toContain('[.gitignore]');
    }).pipe(
      Effect.provide(
        layer(
          fakeSessionRunner({
            detail: () =>
              Effect.succeed({
                session: session('running', 'session-1'),
                events: [],
                receipt: undefined,
              }),
            verifyStore: () =>
              Effect.succeed({
                ignored: false,
                issues: [{ field: '.gitignore', message: 'not ignored' }],
              }),
          }),
        ),
      ),
    ),
  );

  Vitest.it.effect('renders a verify verdict', () =>
    Effect.gen(function* () {
      const text = yield* execute({ kind: 'Verify', id: 'session-1' }, '/repo');
      Vitest.expect(text).toContain('valid yes');
      Vitest.expect(text).toContain('resumable no');
    }).pipe(
      Effect.provide(
        layer(
          fakeSessionRunner({
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
          id: 'session-1',
          prompt: 'go',
          name: undefined,
          model: undefined,
          thinking: undefined,
          parent: undefined,
          related: undefined,
          tools: undefined,
        },
        '/repo',
      );
      Vitest.expect(text).toBe("Session 'session-1' done: finished");
    }).pipe(
      Effect.provide(
        layer(
          fakeSessionRunner({
            start: (input) =>
              input.onSettled === undefined
                ? Effect.fail('missing hook')
                : input
                    .onSettled({
                      session: session('done', 'session-1'),
                      events: [],
                      receipt: { outcome: 'done', summary: 'finished' },
                    })
                    .pipe(Effect.as(session('running', 'session-1'))),
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
          id: 'session-1',
          prompt: 'go',
          name: undefined,
          model: undefined,
          thinking: undefined,
          parent: undefined,
          related: undefined,
          tools: undefined,
        },
        '/repo',
        { startMode: 'detach' },
      );
      Vitest.expect(text).toBe("Session 'session-1' started.");
    }).pipe(
      Effect.provide(
        layer(
          fakeSessionRunner({
            // Never settles: a parked/dead session must not block the caller.
            start: () => Effect.succeed(session('running', 'session-1')),
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
          id: 'session-1',
          prompt: 'go',
          name: undefined,
          model: undefined,
          thinking: undefined,
          parent: undefined,
          related: undefined,
          tools: undefined,
        },
        '/repo',
        { settlementTimeout: Duration.millis(10) },
      );
      Vitest.expect(text).toBe("Session 'session-1' still running; check its status.");
    }).pipe(
      Effect.provide(
        layer(fakeSessionRunner({ start: () => Effect.succeed(session('running', 'session-1')) })),
      ),
    ),
  );

  Vitest.it.effect('invokes the completion hook seam on settlement', () =>
    Effect.gen(function* () {
      let hooked = false;
      yield* execute(
        {
          kind: 'Start',
          id: 'session-1',
          prompt: 'go',
          name: undefined,
          model: undefined,
          thinking: undefined,
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
          fakeSessionRunner({
            start: (input) =>
              (
                input.onSettled?.({
                  session: session('done', 'session-1'),
                  events: [],
                  receipt: { outcome: 'done', summary: 'ok' },
                }) ?? Effect.void
              ).pipe(Effect.as(session('running', 'session-1'))),
          }),
        ),
      ),
    ),
  );

  Vitest.it.effect('resume delegates to the engine', () =>
    Effect.gen(function* () {
      const text = yield* execute({ kind: 'Resume', id: 'session-1', prompt: 'again' }, '/repo');
      Vitest.expect(text).toBe("Resumed 'session-1'.");
    }).pipe(
      Effect.provide(
        layer(
          fakeSessionRunner({
            resume: (_root, id) => Effect.succeed(session('running', id)),
          }),
        ),
      ),
    ),
  );

  Vitest.it.effect('interrupt delegates to the engine', () => {
    let interrupted = '';
    return Effect.gen(function* () {
      const text = yield* execute({ kind: 'Interrupt', id: 'session-1' }, '/repo');
      Vitest.expect(text).toBe("Interrupted 'session-1'.");
      Vitest.expect(interrupted).toBe('session-1');
    }).pipe(
      Effect.provide(
        layer(
          fakeSessionRunner({
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
