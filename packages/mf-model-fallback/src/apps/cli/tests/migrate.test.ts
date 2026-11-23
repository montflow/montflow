import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { FallbackStore, FallbackTrigger, ModelChain } from '../../../modules/index.js';
import { migrate } from '../index.js';

/** Run one case against a throwaway workspace, always deleting it afterwards. */
const withTempDir = <A, E>(use: (root: string) => Effect.Effect<A, E>): Effect.Effect<A, E> =>
  Effect.gen(function* () {
    const root = yield* Effect.promise(() => mkdtemp(join(tmpdir(), 'mf-fallback-')));
    return yield* use(root).pipe(
      Effect.ensuring(Effect.promise(() => rm(root, { recursive: true, force: true }))),
    );
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

const labels = (chain: ReadonlyArray<ModelChain.Ref>): ReadonlyArray<string> =>
  chain.map((ref) => ModelChain.label(ref));

Vitest.describe('Engines.migrate runtime', () => {
  Vitest.it.effect('fails with nothing to migrate on an empty workspace', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const error = yield* migrate({ cwd: root }).pipe(Effect.flip);

        Vitest.expect(error).toBe(
          'Nothing to migrate: no chain in opencode.jsonc options. Write one with `set`.',
        );
        Vitest.expect(existsSync(FallbackStore.file(root))).toBe(false);
      }),
    ),
  );

  Vitest.it.effect('fails when opencode.jsonc is not valid JSONC', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(join(root, 'opencode.jsonc'), '{ "plugins": [ }', 'utf8'),
        );

        const error = yield* migrate({ cwd: root }).pipe(Effect.flip);

        Vitest.expect(error).toContain('not valid JSONC');
        Vitest.expect(existsSync(FallbackStore.file(root))).toBe(false);
      }),
    ),
  );

  Vitest.it.effect('fails when opencode.jsonc has no options for this plugin', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(join(root, 'opencode.jsonc'), '{"plugins":["other-plugin"]}\n', 'utf8'),
        );

        const error = yield* migrate({ cwd: root }).pipe(Effect.flip);

        Vitest.expect(error).toContain('Nothing to migrate');
        Vitest.expect(existsSync(FallbackStore.file(root))).toBe(false);
      }),
    ),
  );

  Vitest.it.effect('writes the store from legacy options and clears them from opencode.jsonc', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedOptions(root, '{"chain":["a/one","b/two"],"triggers":["auth"]}');

        const result = yield* migrate({ cwd: root });

        Vitest.expect(result).toStrictEqual({
          path: FallbackStore.file(root),
          changed: true,
          chain: ModelChain.parse(['a/one', 'b/two']),
          triggers: ['auth'],
          cleared: true,
        });
        Vitest.expect(yield* readJson(FallbackStore.file(root))).toStrictEqual({
          version: 1,
          chain: ['a/one', 'b/two'],
          triggers: ['auth'],
        });
        Vitest.expect(yield* readJson(join(root, 'opencode.jsonc'))).toStrictEqual({
          plugins: [{ package: '@montflow/model-fallback' }],
        });
      }),
    ),
  );

  Vitest.it.effect('migrates options that omit triggers with the default triggers', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedOptions(root, '{"chain":["a/one"]}');

        const result = yield* migrate({ cwd: root });

        Vitest.expect(labels(result.chain)).toStrictEqual(['a/one']);
        Vitest.expect(result.triggers).toStrictEqual(FallbackTrigger.defaults);
        Vitest.expect((yield* FallbackStore.read(root)).config.triggers).toStrictEqual(
          FallbackTrigger.defaults,
        );
      }),
    ),
  );

  Vitest.it.effect('refuses when a valid store already exists, leaving both files unchanged', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedOptions(root, '{"chain":["b/two"]}');
        yield* FallbackStore.write(root, {
          chain: ModelChain.parse(['a/one']),
          triggers: ['auth'],
        });
        const storeBefore = yield* Effect.promise(() => readFile(FallbackStore.file(root), 'utf8'));
        const optionsBefore = yield* Effect.promise(() =>
          readFile(join(root, 'opencode.jsonc'), 'utf8'),
        );

        const error = yield* migrate({ cwd: root }).pipe(Effect.flip);

        Vitest.expect(error).toContain('already valid');
        Vitest.expect(yield* Effect.promise(() => readFile(FallbackStore.file(root), 'utf8'))).toBe(
          storeBefore,
        );
        Vitest.expect(
          yield* Effect.promise(() => readFile(join(root, 'opencode.jsonc'), 'utf8')),
        ).toBe(optionsBefore);
      }),
    ),
  );
});
