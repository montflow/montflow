import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { FallbackStore } from '../index.js';

/** Run one case against a throwaway workspace, always deleting it afterwards. */
const withTempDir = <A, E>(use: (root: string) => Effect.Effect<A, E>): Effect.Effect<A, E> =>
  Effect.gen(function* () {
    const root = yield* Effect.promise(() => mkdtemp(join(tmpdir(), 'mf-fallback-')));
    return yield* use(root).pipe(
      Effect.ensuring(Effect.promise(() => rm(root, { recursive: true, force: true }))),
    );
  });

const writeStore = (root: string, text: string): Effect.Effect<void> =>
  Effect.promise(async () => {
    await mkdir(FallbackStore.directory(root), { recursive: true });
    await writeFile(FallbackStore.file(root), text, 'utf8');
  });

Vitest.describe('FallbackStore.changeToken runtime', () => {
  Vitest.it.effect('reports absent when the store does not exist', () =>
    withTempDir((root) =>
      Effect.sync(() => {
        Vitest.expect(FallbackStore.changeToken(root)).toBe('absent');
      }),
    ),
  );

  Vitest.it.effect('changes when the store file appears', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const before = FallbackStore.changeToken(root);
        yield* writeStore(root, '{"chain":["a/one"]}');
        Vitest.expect(FallbackStore.changeToken(root)).not.toBe(before);
      }),
    ),
  );

  Vitest.it.effect('changes when the store bytes change', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* writeStore(root, '{"chain":["a/one"]}');
        const before = FallbackStore.changeToken(root);
        yield* writeStore(root, '{"chain":["a/one","b/two"]}');
        Vitest.expect(FallbackStore.changeToken(root)).not.toBe(before);
      }),
    ),
  );

  Vitest.it.effect('is stable when nothing changes', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* writeStore(root, '{"chain":["a/one"]}');
        const before = FallbackStore.changeToken(root);
        Vitest.expect(FallbackStore.changeToken(root)).toBe(before);
      }),
    ),
  );
});
