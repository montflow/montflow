import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { FallbackStore } from '../../../modules/index.js';
import { remove } from '../index.js';

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

/** Write the legacy plugin options entry the host used to read. */
const seedOptions = (root: string, options: string): Effect.Effect<void> =>
  Effect.promise(() =>
    writeFile(
      join(root, 'opencode.jsonc'),
      `{"plugins":[{"package":"@montflow/model-fallback","options":${options}}]}\n`,
      'utf8',
    ),
  );

const readJson = (path: string): Effect.Effect<unknown> =>
  Effect.promise(() => readFile(path, 'utf8')).pipe(Effect.map((text) => JSON.parse(text)));

Vitest.describe('Engines.remove runtime', () => {
  Vitest.it.effect('deletes the store and clears the legacy options', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedStore(root, '{"version":1,"chain":["a/one"],"triggers":["auth"]}\n');
        yield* seedOptions(root, '{"chain":["b/two"]}');

        const result = yield* remove({ cwd: root });

        Vitest.expect(result).toStrictEqual({
          path: FallbackStore.file(root),
          changed: true,
          cleared: true,
        });
        Vitest.expect(existsSync(FallbackStore.file(root))).toBe(false);
        Vitest.expect(yield* readJson(join(root, 'opencode.jsonc'))).toStrictEqual({
          plugins: [{ package: '@montflow/model-fallback' }],
        });
      }),
    ),
  );

  Vitest.it.effect('removes the store and warns when the legacy options cannot be cleared', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedStore(root, '{"version":1,"chain":["a/one"],"triggers":["auth"]}\n');
        yield* Effect.promise(() =>
          writeFile(join(root, 'opencode.jsonc'), '{ "plugins": [ }', 'utf8'),
        );

        const result = yield* remove({ cwd: root });

        Vitest.expect(result.changed).toBe(true);
        Vitest.expect(result.cleared).toBe(false);
        Vitest.expect(result.warning).toContain('not valid JSONC');
        Vitest.expect(existsSync(FallbackStore.file(root))).toBe(false);
      }),
    ),
  );
});
