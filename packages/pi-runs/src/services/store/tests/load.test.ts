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
        const error = yield* store.load('nope').pipe(Effect.flip);
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
        const error = yield* store.load('run-1').pipe(Effect.flip);
        Vitest.expect(error).toBeInstanceOf(StoreError);
        Vitest.expect(error.reason).toContain('has no receipt');
      }),
    );
  });

  Vitest.it.live('fails verification for a raw message that is not a Pi message', () => {
    const root = freshRoot();
    return provideStore(
      root,
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'run-1' });
        yield* store.start('run-1');
        const line = JSON.stringify({
          seq: 1,
          role: 'assistant',
          text: 'hi',
          at: '2026-09-05T00:00:01Z',
          message: null,
        });
        yield* Effect.sync(() =>
          Fs.writeFileSync(NodePath.join(root, 'run-1', 'session.jsonl'), `${line}\n`),
        );
        const error = yield* store.load('run-1').pipe(Effect.flip);
        Vitest.expect(error).toBeInstanceOf(StoreError);
        Vitest.expect(error.reason).toContain('failed verification');
        Vitest.expect(error.reason).toContain('[session.message]');
      }),
    );
  });

  Vitest.it.live('fails when the receipt belongs to another run', () => {
    const root = freshRoot();
    return provideStore(
      root,
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'run-1' });
        yield* store.start('run-1');
        yield* store.settle({ runId: 'run-1', outcome: 'done', summary: 'green' });
        const receiptPath = NodePath.join(root, 'run-1', 'receipt.md');
        const text = Fs.readFileSync(receiptPath, 'utf8');
        yield* Effect.sync(() =>
          Fs.writeFileSync(receiptPath, text.replace('"runId":"run-1"', '"runId":"run-2"')),
        );
        const error = yield* store.load('run-1').pipe(Effect.flip);
        Vitest.expect(error).toBeInstanceOf(StoreError);
        Vitest.expect(error.reason).toContain("belongs to 'run-2'");
      }),
    );
  });
});
