import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { StoreTag as Store, freshRoot, provideStore } from './helpers.js';

Vitest.describe('Store.list runtime', () => {
  Vitest.it.live('returns empty on a fresh root', () =>
    provideStore(
      freshRoot(),
      Effect.gen(function* () {
        const store = yield* Store;
        Vitest.expect(yield* store.list()).toStrictEqual([]);
      }),
    ),
  );

  Vitest.it.live('returns ids sorted', () =>
    provideStore(
      freshRoot(),
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'b-run' });
        yield* store.create({ id: 'a-run' });
        const runs = yield* store.list();
        Vitest.expect(runs.map((run) => run.id)).toStrictEqual(['a-run', 'b-run']);
      }),
    ),
  );
});
