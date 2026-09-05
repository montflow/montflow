import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import {
  StoreTag as Store,
  StoreErrorClass as StoreError,
  freshRoot,
  provideStore,
} from './helpers.js';

Vitest.describe('Store.create runtime', () => {
  Vitest.it.live('creates a pending run', () =>
    provideStore(
      freshRoot(),
      Effect.gen(function* () {
        const store = yield* Store;
        const run = yield* store.create({ id: 'run-1', name: 'smoke' });
        Vitest.expect(run.status).toBe('pending');
        Vitest.expect(run.id).toBe('run-1');
        const loaded = yield* store.load('run-1');
        Vitest.expect(loaded.events).toHaveLength(0);
        Vitest.expect(loaded.receipt).toBeNull();
      }),
    ),
  );

  Vitest.it.live('fails on duplicate id', () =>
    provideStore(
      freshRoot(),
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'run-1' });
        const error = yield* Effect.flip(store.create({ id: 'run-1' }));
        Vitest.expect(error).toBeInstanceOf(StoreError);
        Vitest.expect(error.reason).toContain('already exists');
      }),
    ),
  );
});
