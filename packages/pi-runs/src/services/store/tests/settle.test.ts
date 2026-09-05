import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import {
  StoreTag as Store,
  StoreErrorClass as StoreError,
  freshRoot,
  provideStore,
} from './helpers.js';

Vitest.describe('Store.settle runtime', () => {
  Vitest.it.live('settles running as done with receipt', () =>
    provideStore(
      freshRoot(),
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'run-1' });
        yield* store.start('run-1');
        const receipt = yield* store.settle({ runId: 'run-1', outcome: 'done', summary: 'green' });
        Vitest.expect(receipt.outcome).toBe('done');
        const loaded = yield* store.load('run-1');
        Vitest.expect(loaded.run.status).toBe('done');
        Vitest.expect(loaded.receipt?.summary).toBe('green');
      }),
    ),
  );

  Vitest.it.live('fails on double settle', () =>
    provideStore(
      freshRoot(),
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'run-1' });
        yield* store.start('run-1');
        yield* store.settle({ runId: 'run-1', outcome: 'done', summary: 'green' });
        const error = yield* Effect.flip(
          store.settle({ runId: 'run-1', outcome: 'failed', summary: 'again' }),
        );
        Vitest.expect(error).toBeInstanceOf(StoreError);
        Vitest.expect(error.reason).toContain("from status 'done'");
      }),
    ),
  );
});
