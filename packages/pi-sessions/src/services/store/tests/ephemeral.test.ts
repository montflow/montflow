import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { provideEphemeral, StoreTag as Store, StoreErrorClass as StoreError } from './helpers.js';

Vitest.describe('Store.ephemeral runtime', () => {
  Vitest.it.effect('runs the full lifecycle without disk', () =>
    provideEphemeral(
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'session-1' });
        yield* store.start('session-1');
        const event = yield* store.append({ sessionId: 'session-1', role: 'user', text: 'hello' });
        Vitest.expect(event.seq).toBe(1);
        yield* store.settle({ sessionId: 'session-1', outcome: 'done', summary: 'green' });
        const loaded = yield* store.load('session-1');
        Vitest.expect(loaded.session.status).toBe('done');
        Vitest.expect(loaded.events).toHaveLength(1);
        Vitest.expect(loaded.receipt?.outcome).toBe('done');
      }),
    ),
  );

  Vitest.it.effect('enforces invariants like the file backend', () =>
    provideEphemeral(
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'session-1' });
        const error = yield* store
          .settle({ sessionId: 'session-1', outcome: 'done', summary: 'x' })
          .pipe(Effect.flip);
        Vitest.expect(error).toBeInstanceOf(StoreError);
        Vitest.expect(error.reason).toContain("from status 'pending'");
      }),
    ),
  );

  Vitest.it.effect('lists sessions sorted', () =>
    provideEphemeral(
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'b-session' });
        yield* store.create({ id: 'a-session' });
        const sessions = yield* store.list();
        Vitest.expect(sessions.map((session) => session.id)).toStrictEqual([
          'a-session',
          'b-session',
        ]);
      }),
    ),
  );
});
