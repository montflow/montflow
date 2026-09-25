import * as Fs from 'node:fs';
import * as NodePath from 'node:path';
import * as Vitest from '@effect/vitest';
import { Clock, Effect } from 'effect';
import {
  StoreTag as Store,
  StoreErrorClass as StoreError,
  freshRoot,
  provideStore,
} from './helpers.js';

const lockDir = (root: string, id: string): string => NodePath.join(root, id, '.lock');

Vitest.describe('Store lock runtime', () => {
  Vitest.it.live('blocks a write while a fresh lock is held', () => {
    const root = freshRoot();
    return provideStore(
      root,
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'run-1' });
        yield* store.start('run-1');
        yield* Effect.sync(() => Fs.mkdirSync(lockDir(root, 'run-1'), { recursive: true }));
        const error = yield* store
          .append({ runId: 'run-1', role: 'user', text: 'hello' })
          .pipe(Effect.flip);
        Vitest.expect(error).toBeInstanceOf(StoreError);
        Vitest.expect(error.reason).toContain('is locked');
        Vitest.expect(error.reason).toContain('remove it if no writer is active');
      }),
    );
  });

  Vitest.it.live('reclaims a stale lock left by a crashed writer', () => {
    const root = freshRoot();
    return provideStore(
      root,
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'run-1' });
        yield* store.start('run-1');
        const now = yield* Clock.currentTimeMillis;
        yield* Effect.sync(() => {
          const dir = lockDir(root, 'run-1');
          Fs.mkdirSync(dir, { recursive: true });
          const past = new Date(now - 5 * 60_000);
          Fs.utimesSync(dir, past, past);
        });
        const event = yield* store.append({ runId: 'run-1', role: 'user', text: 'hello' });
        Vitest.expect(event.seq).toBe(1);
      }),
    );
  });

  Vitest.it.live('removes the lock after a write so nothing committable remains', () => {
    const root = freshRoot();
    return provideStore(
      root,
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'run-1' });
        yield* store.start('run-1');
        yield* store.append({ runId: 'run-1', role: 'user', text: 'hello' });
        const exists = Fs.existsSync(lockDir(root, 'run-1'));
        Vitest.expect(exists).toBe(false);
      }),
    );
  });
});
