import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import {
  StoreTag as Store,
  StoreErrorClass as StoreError,
  freshRoot,
  provideStore,
} from './helpers.js';

Vitest.describe('Store.progress runtime', () => {
  Vitest.it.live('records a progress line on a running run', () =>
    provideStore(
      freshRoot(),
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'run-1' });
        yield* store.start('run-1');
        yield* store.progress({ runId: 'run-1', message: 'scouting auth' });
        const loaded = yield* store.load('run-1');
        Vitest.expect(loaded.run.progress).toBe('scouting auth');
      }),
    ),
  );

  Vitest.it.live('preserves progress across a later status transition', () =>
    provideStore(
      freshRoot(),
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'run-2' });
        yield* store.start('run-2');
        yield* store.progress({ runId: 'run-2', message: 'halfway' });
        yield* store.settle({ runId: 'run-2', outcome: 'done', summary: 'ok' });
        const loaded = yield* store.load('run-2');
        Vitest.expect(loaded.run.progress).toBe('halfway');
      }),
    ),
  );

  Vitest.it.live('rejects progress on a run that is not live', () =>
    provideStore(
      freshRoot(),
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'run-3' });
        const error = yield* store.progress({ runId: 'run-3', message: 'nope' }).pipe(Effect.flip);
        Vitest.expect(error).toBeInstanceOf(StoreError);
        Vitest.expect(error.reason).toContain("status 'pending'");
      }),
    ),
  );
});
