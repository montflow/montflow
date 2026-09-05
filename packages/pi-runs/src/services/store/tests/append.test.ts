import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import {
  StoreTag as Store,
  StoreErrorClass as StoreError,
  freshRoot,
  provideStore,
} from './helpers.js';

Vitest.describe('Store.append runtime', () => {
  Vitest.it.live('assigns increasing seq numbers', () =>
    provideStore(
      freshRoot(),
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'run-1' });
        yield* store.start('run-1');
        const first = yield* store.append({ runId: 'run-1', role: 'user', text: 'hello' });
        const second = yield* store.append({ runId: 'run-1', role: 'assistant', text: 'hi' });
        Vitest.expect(first.seq).toBe(1);
        Vitest.expect(second.seq).toBe(2);
        const loaded = yield* store.load('run-1');
        Vitest.expect(loaded.events.map((event) => event.text)).toStrictEqual(['hello', 'hi']);
      }),
    ),
  );

  Vitest.it.live('fails before start', () =>
    provideStore(
      freshRoot(),
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'run-1' });
        const error = yield* Effect.flip(store.append({ runId: 'run-1', role: 'user', text: 'x' }));
        Vitest.expect(error).toBeInstanceOf(StoreError);
        Vitest.expect(error.reason).toContain("with status 'pending'");
      }),
    ),
  );
});
