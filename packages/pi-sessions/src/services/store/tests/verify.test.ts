import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { StoreTag as Store, freshRoot, provideStore } from './helpers.js';

Vitest.describe('Store.verify runtime', () => {
  Vitest.it.live('verifies a fresh running session as valid and resumable', () =>
    provideStore(
      freshRoot(),
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'session-1' });
        yield* store.start('session-1');
        yield* store.append({ sessionId: 'session-1', role: 'user', text: 'hello' });
        const verdict = yield* store.verify('session-1');
        Vitest.expect(verdict.valid).toBe(true);
        Vitest.expect(verdict.resumable).toBe(true);
        Vitest.expect(verdict.issues).toStrictEqual([]);
      }),
    ),
  );

  Vitest.it.live('verifies a settled session as valid but not resumable', () =>
    provideStore(
      freshRoot(),
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'session-2' });
        yield* store.start('session-2');
        yield* store.append({ sessionId: 'session-2', role: 'user', text: 'hello' });
        yield* store.settle({ sessionId: 'session-2', outcome: 'done', summary: 'finished' });
        const verdict = yield* store.verify('session-2');
        Vitest.expect(verdict.valid).toBe(true);
        Vitest.expect(verdict.resumable).toBe(false);
      }),
    ),
  );
});
