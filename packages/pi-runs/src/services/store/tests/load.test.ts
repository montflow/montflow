import * as Fs from 'node:fs';
import * as NodePath from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import {
  StoreTag as Store,
  StoreErrorClass as StoreError,
  freshRoot,
  provideStore,
} from './helpers.js';

Vitest.describe('Store.load runtime', () => {
  Vitest.it.live('fails on unknown id', () =>
    provideStore(
      freshRoot(),
      Effect.gen(function* () {
        const store = yield* Store;
        const error = yield* Effect.flip(store.load('nope'));
        Vitest.expect(error).toBeInstanceOf(StoreError);
      }),
    ),
  );

  Vitest.it.live('fails when the receipt is deleted after settle', () => {
    const root = freshRoot();
    return provideStore(
      root,
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'run-1' });
        yield* store.start('run-1');
        yield* store.settle({ runId: 'run-1', outcome: 'done', summary: 'green' });
        yield* Effect.sync(() => Fs.rmSync(NodePath.join(root, 'run-1', 'receipt.md')));
        const error = yield* Effect.flip(store.load('run-1'));
        Vitest.expect(error).toBeInstanceOf(StoreError);
        Vitest.expect(error.reason).toContain('has no receipt');
      }),
    );
  });
});
