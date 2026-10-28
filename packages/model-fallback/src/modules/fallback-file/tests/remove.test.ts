import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { FallbackFile } from '../index.js';

/** Run one case against a throwaway workspace, always deleting it afterwards. */
const withTempDir = <A, E>(use: (root: string) => Effect.Effect<A, E>): Effect.Effect<A, E> =>
  Effect.gen(function* () {
    const root = yield* Effect.promise(() => mkdtemp(join(tmpdir(), 'mf-fallback-')));
    return yield* use(root).pipe(
      Effect.ensuring(Effect.promise(() => rm(root, { recursive: true, force: true }))),
    );
  });

const configPath = (root: string): string => join(root, 'opencode.jsonc');

const readText = (root: string): Effect.Effect<string> =>
  Effect.promise(() => readFile(configPath(root), 'utf8'));

Vitest.describe('FallbackFile.remove runtime', () => {
  Vitest.it.effect('deletes only this plugin entry and leaves the others', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
            configPath(root),
            `{
  "plugins": [
    "other-plugin",
    {
      "package": "@montflow/model-fallback",
      "options": { "chain": ["a/one"] }
    }
  ]
}
`,
            'utf8',
          ),
        );

        const removed = yield* FallbackFile.remove(root);
        // SAFETY: this file was written by the test with the documented `plugins` array shape.
        const document = JSON.parse(yield* readText(root)) as {
          plugins: ReadonlyArray<string | { package: string }>;
        };

        Vitest.expect(removed.changed).toBe(true);
        Vitest.expect(document.plugins).toStrictEqual(['other-plugin']);
      }),
    ),
  );

  Vitest.it.effect('reports changed: false and keeps the file when the entry is absent', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(configPath(root), '{ "plugins": ["other-plugin"] }\n', 'utf8'),
        );
        const before = yield* readText(root);

        const removed = yield* FallbackFile.remove(root);

        Vitest.expect(removed.changed).toBe(false);
        Vitest.expect(yield* readText(root)).toBe(before);
      }),
    ),
  );

  Vitest.it.effect('reports changed: false when no config file exists', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const removed = yield* FallbackFile.remove(root);

        Vitest.expect(removed.changed).toBe(false);
        Vitest.expect(removed.path).toBe(configPath(root));
      }),
    ),
  );
});
