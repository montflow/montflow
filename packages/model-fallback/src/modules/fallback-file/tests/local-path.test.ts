import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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

  Vitest.it.effect('fails with a FileError when opencode.jsonc is not valid JSONC', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* writeConfig(root, '{ "plugins": [ }');

        const error = yield* FallbackFile.read(root).pipe(Effect.flip);

        Vitest.expect(error).toBeInstanceOf(FallbackFile.FileError);
        Vitest.expect(error.reason).toContain('not valid JSONC');
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
