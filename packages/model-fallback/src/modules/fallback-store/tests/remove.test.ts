import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { ModelChain } from '../../model-chain/index.js';
import { FallbackStore } from '../index.js';

/** Run one case against a throwaway workspace, always deleting it afterwards. */
const withTempDir = <A, E>(use: (root: string) => Effect.Effect<A, E>): Effect.Effect<A, E> =>
  Effect.gen(function* () {
    const root = yield* Effect.promise(() => mkdtemp(join(tmpdir(), 'mf-fallback-')));
    return yield* use(root).pipe(
      Effect.ensuring(Effect.promise(() => rm(root, { recursive: true, force: true }))),
    );
  });

const seedStore = (root: string, text: string): Effect.Effect<void> =>
  Effect.promise(async () => {
    const target = FallbackStore.file(root);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, text, 'utf8');
  });

Vitest.describe('FallbackStore.remove runtime', () => {
  Vitest.it.effect('deletes an existing store file', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* FallbackStore.write(root, {
          chain: ModelChain.parse(['a/one']),
          triggers: ['auth'],
        });

        const removed = yield* FallbackStore.remove(root);

        Vitest.expect(removed).toStrictEqual({ changed: true });
        Vitest.expect(existsSync(FallbackStore.file(root))).toBe(false);
      }),
    ),
  );

  Vitest.it.effect('reports changed: false when the store is absent', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const removed = yield* FallbackStore.remove(root);

        Vitest.expect(removed).toStrictEqual({ changed: false });
        Vitest.expect(existsSync(FallbackStore.file(root))).toBe(false);
      }),
    ),
  );

  Vitest.it.effect('leaves opencode.jsonc untouched', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const config = join(root, 'opencode.jsonc');
        yield* Effect.promise(() =>
          writeFile(
            config,
            '{"plugins":[{"package":"@montflow/model-fallback","options":{"chain":["a/one"]}}]}\n',
            'utf8',
          ),
        );
        const before = yield* Effect.promise(() => readFile(config, 'utf8'));
        yield* seedStore(root, '{"version":1,"chain":["a/one"],"triggers":["auth"]}\n');

        yield* FallbackStore.remove(root);

        Vitest.expect(yield* Effect.promise(() => readFile(config, 'utf8'))).toBe(before);
      }),
    ),
  );
});
