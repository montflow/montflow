import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import {
  StoreTag as Store,
  StoreErrorClass as StoreError,
  freshRoot,
  provideStore,
} from './helpers.js';

Vitest.describe('Store.progress runtime', () => {
  Vitest.it.live('records a progress line on a running session', () =>
    provideStore(
      freshRoot(),
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'session-1' });
        yield* store.start('session-1');
        yield* store.progress({ sessionId: 'session-1', message: 'scouting auth' });
        const loaded = yield* store.load('session-1');
        Vitest.expect(loaded.session.progress).toBe('scouting auth');
      }),
    ),
  );

  Vitest.it.live('preserves progress across a later status transition', () =>
    provideStore(
      freshRoot(),
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'session-2' });
        yield* store.start('session-2');
        yield* store.progress({ sessionId: 'session-2', message: 'halfway' });
        yield* store.settle({ sessionId: 'session-2', outcome: 'done', summary: 'ok' });
        const loaded = yield* store.load('session-2');
        Vitest.expect(loaded.session.progress).toBe('halfway');
      }),
    ),
  );

  Vitest.it.live('rejects progress on a session that is not live', () =>
    provideStore(
      freshRoot(),
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'session-3' });
        const error = yield* store
          .progress({ sessionId: 'session-3', message: 'nope' })
          .pipe(Effect.flip);
        Vitest.expect(error).toBeInstanceOf(StoreError);
        Vitest.expect(error.reason).toContain("status 'pending'");
      }),
    ),
  );
});
