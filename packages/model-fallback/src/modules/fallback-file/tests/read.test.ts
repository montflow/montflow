import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { FallbackConfig } from '../../fallback-config/index.js';
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

const writeConfig = (root: string, text: string): Effect.Effect<void> =>
  Effect.promise(() => writeFile(join(root, 'opencode.jsonc'), text, 'utf8'));

Vitest.describe('FallbackFile.read runtime', () => {
  Vitest.it.effect('reports an idle, absent config when no file exists', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const current = yield* FallbackFile.read(root);

        Vitest.expect(current.present).toBe(false);
        Vitest.expect(current.path).toBe(join(root, 'opencode.jsonc'));
        Vitest.expect(current.path.endsWith('opencode.jsonc')).toBe(true);
        Vitest.expect(current.config).toStrictEqual(FallbackConfig.idle);
        Vitest.expect(current.config.chain).toStrictEqual([]);
      }),
    ),
  );

  Vitest.it.effect('decodes the chain and triggers of an existing object entry', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* writeConfig(
          root,
          `{
  "plugins": [
    {
      "package": "@montflow/model-fallback",
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

        Vitest.expect(current.present).toBe(true);
        Vitest.expect(current.config.chain.map((ref) => ModelChain.label(ref))).toStrictEqual([
          'a/one',
          'b/two',
        ]);
        Vitest.expect(current.config.triggers).toStrictEqual(['auth', 'quota']);
      }),
    ),
  );

  Vitest.it.effect('decodes a bare string entry as an idle config', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* writeConfig(root, '{ "plugins": ["@montflow/model-fallback"] }\n');

        const current = yield* FallbackFile.read(root);

        Vitest.expect(current.present).toBe(true);
        Vitest.expect(current.config).toStrictEqual(FallbackConfig.idle);
      }),
    ),
  );

  Vitest.it.effect('stays idle when the file exists but has no matching entry', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* writeConfig(root, '{ "plugins": ["some-other-plugin"] }\n');

        const current = yield* FallbackFile.read(root);

        Vitest.expect(current.present).toBe(true);
        Vitest.expect(current.config).toStrictEqual(FallbackConfig.idle);
      }),
    ),
  );

  Vitest.it.effect('fails with FileError on malformed JSONC', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* writeConfig(root, '{ "plugins": [ { "package": } ] }\n');

        const error = yield* FallbackFile.read(root).pipe(Effect.flip);

        Vitest.expect(error).toBeInstanceOf(FallbackFile.FileError);
        Vitest.expect(error.reason).toContain('is not valid JSONC');
      }),
    ),
  );
});
