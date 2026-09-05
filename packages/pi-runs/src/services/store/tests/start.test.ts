import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import {
  StoreTag as Store,
  StoreErrorClass as StoreError,
  freshRoot,
  provideStore,
} from './helpers.js';

Vitest.describe('Store.start runtime', () => {
  Vitest.it.live('moves pending to running', () =>
    provideStore(
      freshRoot(),
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'run-1' });
        const started = yield* store.start('run-1');
        Vitest.expect(started.status).toBe('running');
      }),
    ),
  );

  Vitest.it.live('fails when already running', () =>
    provideStore(
      freshRoot(),
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'run-1' });
        yield* store.start('run-1');
        const error = yield* Effect.flip(store.start('run-1'));
        Vitest.expect(error).toBeInstanceOf(StoreError);
        Vitest.expect(error.reason).toContain("from status 'running'");
      }),
    ),
  );
});
