import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { StoreTag as Store, freshRoot, provideStore } from './helpers.js';

Vitest.describe('Store.verify runtime', () => {
  Vitest.it.live('verifies a fresh running run as valid and resumable', () =>
    provideStore(
      freshRoot(),
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'run-1' });
        yield* store.start('run-1');
        yield* store.append({ runId: 'run-1', role: 'user', text: 'hello' });
        const verdict = yield* store.verify('run-1');
        Vitest.expect(verdict.valid).toBe(true);
        Vitest.expect(verdict.resumable).toBe(true);
        Vitest.expect(verdict.issues).toStrictEqual([]);
      }),
    ),
  );

  Vitest.it.live('verifies a settled run as valid but not resumable', () =>
    provideStore(
      freshRoot(),
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'run-2' });
        yield* store.start('run-2');
        yield* store.append({ runId: 'run-2', role: 'user', text: 'hello' });
        yield* store.settle({ runId: 'run-2', outcome: 'done', summary: 'finished' });
        const verdict = yield* store.verify('run-2');
        Vitest.expect(verdict.valid).toBe(true);
        Vitest.expect(verdict.resumable).toBe(false);
      }),
    ),
  );
});
