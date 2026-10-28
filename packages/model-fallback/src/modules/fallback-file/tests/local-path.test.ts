import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
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

/** The absolute spec a local checkout registers itself with, one level down from the workspace. */
const localPath = (root: string): string => join(root, 'packages', 'model-fallback');

Vitest.describe('FallbackFile.read runtime', () => {
  Vitest.it.effect('decodes an entry registered by absolute local path', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const spec = localPath(root);
        yield* writeConfig(
          root,
          `{
  "plugins": [
    {
      "package": ${JSON.stringify(spec)},
      "options": {
        "chain": ["a/one", "b/two"],
        "triggers": ["auth", "quota"]
      }
    }
  ]
}
`,
        );

        const current = yield* FallbackFile.read(root);

        Vitest.expect(current.path).toBe(configPath(root));
        Vitest.expect(current.present).toBe(true);
        Vitest.expect(current.config.chain.map((ref) => ModelChain.label(ref))).toStrictEqual([
          'a/one',
          'b/two',
        ]);
        Vitest.expect(current.config.triggers).toStrictEqual(['auth', 'quota']);
      }),
    ),
  );

  Vitest.it.effect('decodes an entry registered by the bare npm spec', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* writeConfig(
          root,
          `{
  "plugins": [
    {
      "package": "@montflow/model-fallback",
      "options": { "chain": ["a/one"], "triggers": ["timeout"] }
    }
  ]
}
`,
        );

        const current = yield* FallbackFile.read(root);

        Vitest.expect(current.present).toBe(true);
        Vitest.expect(current.config.chain.map((ref) => ModelChain.label(ref))).toStrictEqual([
          'a/one',
        ]);
        Vitest.expect(current.config.triggers).toStrictEqual(['timeout']);
      }),
    ),
  );

  Vitest.it.effect('ignores an entry registered by another owner scoped name', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* writeConfig(
          root,
          `{
  "plugins": [
    {
      "package": "@someone/model-fallback",
      "options": { "chain": ["a/one"], "triggers": ["timeout"] }
    }
  ]
}
`,
        );

        const current = yield* FallbackFile.read(root);

        Vitest.expect(current.present).toBe(true);
        Vitest.expect(current.config.chain).toStrictEqual([]);
        Vitest.expect(current.config.triggers).toStrictEqual(FallbackTrigger.defaults);
      }),
    ),
  );
});

Vitest.describe('FallbackFile.write runtime', () => {
  Vitest.it.effect('keeps an existing absolute local spec and updates its options', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const spec = localPath(root);
        yield* writeConfig(
          root,
          `{
  "plugins": [
    "other-plugin",
    {
      "package": ${JSON.stringify(spec)},
      "options": { "chain": ["old/model"] }
    }
  ]
}
`,
        );

        const written = yield* FallbackFile.write(root, {
          chain: ModelChain.parse(['a/one', 'b/two']),
          triggers: ['auth'],
        });
        const text = yield* readText(root);
        // SAFETY: this file was written by FallbackFile.write, so `plugins` is the shape asserted below.
        const document = JSON.parse(text) as {
          plugins: ReadonlyArray<string | { package: string; options: unknown }>;
        };

        Vitest.expect(written.changed).toBe(true);
        Vitest.expect(document.plugins).toHaveLength(2);
        Vitest.expect(document.plugins[0]).toBe('other-plugin');
        Vitest.expect(document.plugins[1]).toStrictEqual({
          package: spec,
          options: { chain: ['a/one', 'b/two'], triggers: ['auth'] },
        });
        Vitest.expect(text).toContain(spec);
        Vitest.expect(text).not.toContain('@montflow/model-fallback');
      }),
    ),
  );

  Vitest.it.effect('writes the npm spec when no entry exists yet', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* writeConfig(root, '{ "plugins": ["other-plugin"] }\n');

        yield* FallbackFile.write(root, {
          chain: ModelChain.parse(['a/one']),
          triggers: ['auth'],
        });
        // SAFETY: this file was written by FallbackFile.write, so `plugins` is the shape asserted below.
        const document = JSON.parse(yield* readText(root)) as {
          plugins: ReadonlyArray<string | { package: string; options: unknown }>;
        };

        Vitest.expect(document.plugins).toStrictEqual([
          'other-plugin',
          {
            package: '@montflow/model-fallback',
            options: { chain: ['a/one'], triggers: ['auth'] },
          },
        ]);
      }),
    ),
  );

  Vitest.it.effect('appends the npm spec beside another owner scoped entry', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* writeConfig(
          root,
          `{
  "plugins": [
    {
      "package": "@someone/model-fallback",
      "options": { "chain": ["foreign/model"], "triggers": ["timeout"] }
    }
  ]
}
`,
        );

        yield* FallbackFile.write(root, {
          chain: ModelChain.parse(['a/one']),
          triggers: ['auth'],
        });
        // SAFETY: this file was written by FallbackFile.write, so `plugins` is the shape asserted below.
        const document = JSON.parse(yield* readText(root)) as {
          plugins: ReadonlyArray<string | { package: string; options: unknown }>;
        };

        Vitest.expect(document.plugins).toHaveLength(2);
        Vitest.expect(document.plugins[0]).toStrictEqual({
          package: '@someone/model-fallback',
          options: { chain: ['foreign/model'], triggers: ['timeout'] },
        });
        Vitest.expect(document.plugins[1]).toStrictEqual({
          package: '@montflow/model-fallback',
          options: { chain: ['a/one'], triggers: ['auth'] },
        });
      }),
    ),
  );
});

Vitest.describe('FallbackFile.remove runtime', () => {
  Vitest.it.effect('removes an entry registered by absolute local path', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const spec = localPath(root);
        yield* writeConfig(
          root,
          `{
  "plugins": [
    "other-plugin",
    {
      "package": ${JSON.stringify(spec)},
      "options": { "chain": ["a/one"] }
    }
  ]
}
`,
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
});
