import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { parse } from 'jsonc-parser';
import { FallbackTrigger } from '../../fallback-trigger/index.js';
import { ModelChain } from '../../model-chain/index.js';
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

const writeConfig = (root: string, text: string): Effect.Effect<void> =>
  Effect.promise(() => writeFile(configPath(root), text, 'utf8'));

const chain = ModelChain.parse(['a/one', 'b/two']);

Vitest.describe('FallbackFile.write runtime', () => {
  Vitest.it.effect('creates opencode.jsonc with a plugins array holding the entry', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const written = yield* FallbackFile.write(root, {
          chain,
          triggers: FallbackTrigger.defaults,
        });

        Vitest.expect(written.path).toBe(configPath(root));
        Vitest.expect(written.changed).toBe(true);
        // SAFETY: the file was just written by FallbackFile.write, which emits strict JSON.
        const document = JSON.parse(yield* readText(root)) as { plugins: unknown };
        Vitest.expect(document.plugins).toStrictEqual([
          {
            package: '@montflow/model-fallback',
            options: {
              chain: ['a/one', 'b/two'],
              triggers: ['quota', 'rate-limit', 'auth'],
            },
          },
        ]);
      }),
    ),
  );

  Vitest.it.effect('updates the existing entry in place, keeping comments and other plugins', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* writeConfig(
          root,
          `{
  // keep this comment
  "plugins": [
    "other-plugin",
    {
      "package": "@montflow/model-fallback",
      "options": { "chain": ["old/model"] }
    }
  ]
}
`,
        );

        const written = yield* FallbackFile.write(root, { chain, triggers: ['auth'] });
        const text = yield* readText(root);
        // SAFETY: this file was written by FallbackFile.write, so `plugins` is the shape asserted below.
        const document = parse(text) as {
          plugins: ReadonlyArray<string | { package: string; options: unknown }>;
        };

        Vitest.expect(written.changed).toBe(true);
        Vitest.expect(text).toContain('// keep this comment');
        Vitest.expect(document.plugins).toHaveLength(2);
        Vitest.expect(document.plugins[0]).toBe('other-plugin');
        Vitest.expect(document.plugins[1]).toStrictEqual({
          package: '@montflow/model-fallback',
          options: { chain: ['a/one', 'b/two'], triggers: ['auth'] },
        });
      }),
    ),
  );

  Vitest.it.effect('reports changed: false and leaves the bytes untouched on a repeat write', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const first = yield* FallbackFile.write(root, { chain, triggers: ['quota'] });
        const before = yield* readText(root);

        const second = yield* FallbackFile.write(root, { chain, triggers: ['quota'] });

        Vitest.expect(first.changed).toBe(true);
        Vitest.expect(second.changed).toBe(false);
        Vitest.expect(second.path).toBe(first.path);
        Vitest.expect(yield* readText(root)).toBe(before);
      }),
    ),
  );

  Vitest.it.effect('appends the entry to an existing plugins array without reordering it', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* writeConfig(root, '{ "plugins": ["other-plugin"] }\n');

        yield* FallbackFile.write(root, { chain: ModelChain.parse(['a/one']), triggers: ['auth'] });

        // SAFETY: this file was written by FallbackFile.write, so `plugins` is the shape asserted below.
        const document = JSON.parse(yield* readText(root)) as {
          plugins: ReadonlyArray<string | { package: string }>;
        };
        Vitest.expect(document.plugins).toHaveLength(2);
        Vitest.expect(document.plugins[0]).toBe('other-plugin');
        Vitest.expect(document.plugins[1]).toStrictEqual({
          package: '@montflow/model-fallback',
          options: { chain: ['a/one'], triggers: ['auth'] },
        });
      }),
    ),
  );
});
