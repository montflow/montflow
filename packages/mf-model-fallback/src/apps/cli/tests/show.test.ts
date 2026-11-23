import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { FallbackStore, FallbackTrigger, ModelChain } from '../../../modules/index.js';
import { show } from '../index.js';

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

const labels = (chain: ReadonlyArray<ModelChain.Ref>): ReadonlyArray<string> =>
  chain.map((ref) => ModelChain.label(ref));

Vitest.describe('Engines.show runtime', () => {
  Vitest.it.effect('reports source none and an idle chain on an empty directory', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const result = yield* show({ cwd: root });

        Vitest.expect(result).toStrictEqual({
          path: FallbackStore.file(root),
          present: false,
          source: 'none',
          chain: [],
          triggers: FallbackTrigger.defaults,
          issues: [],
          legacy: false,
        });
      }),
    ),
  );

  Vitest.it.effect('reports the store chain and triggers with source store', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedStore(
          root,
          '{"version":1,"chain":["a/one","b/two"],"triggers":["auth","quota"]}\n',
        );

        const result = yield* show({ cwd: root });

        Vitest.expect(result.present).toBe(true);
        Vitest.expect(result.path).toBe(FallbackStore.file(root));
        Vitest.expect(result.source).toBe('store');
        Vitest.expect(labels(result.chain)).toStrictEqual(['a/one', 'b/two']);
        Vitest.expect(result.triggers).toStrictEqual(['auth', 'quota']);
        Vitest.expect(result.issues).toStrictEqual([]);
      }),
    ),
  );

  Vitest.it.effect('reports legacy opencode.jsonc options with source options', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedOptions(root, '{"chain":["b/two"]}');

        const result = yield* show({ cwd: root });

        Vitest.expect(result.present).toBe(false);
        Vitest.expect(result.source).toBe('options');
        Vitest.expect(labels(result.chain)).toStrictEqual(['b/two']);
        Vitest.expect(result.triggers).toStrictEqual(FallbackTrigger.defaults);
        Vitest.expect(result.issues).toStrictEqual([]);
      }),
    ),
  );

  Vitest.it.effect('prefers a valid store over legacy options', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedStore(root, '{"version":1,"chain":["a/one"],"triggers":["auth"]}\n');
        yield* seedOptions(root, '{"chain":["b/two"]}');

        const result = yield* show({ cwd: root });

        Vitest.expect(result.source).toBe('store');
        Vitest.expect(labels(result.chain)).toStrictEqual(['a/one']);
        Vitest.expect(result.legacy).toBe(true);
      }),
    ),
  );

  Vitest.it.effect('reports store issues while falling back to legacy options', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedStore(root, '{"chain":[]}\n');
        yield* seedOptions(root, '{"chain":["b/two"]}');

        const result = yield* show({ cwd: root });

        Vitest.expect(result.source).toBe('options');
        Vitest.expect(labels(result.chain)).toStrictEqual(['b/two']);
        Vitest.expect(result.legacy).toBe(false);
        Vitest.expect(result.issues).toStrictEqual([
          {
            field: 'chain',
            message: 'chain must not be empty; delete the file to disable',
            fix: 'run mf-model-fallback set --chain <provider/model>,...',
          },
        ]);
      }),
    ),
  );

  Vitest.it.effect('reports store issues with source none when there are no options', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedStore(root, '{"chain":["a/one"],"triggers":["nope"]}\n');

        const result = yield* show({ cwd: root });

        Vitest.expect(result.source).toBe('none');
        Vitest.expect(result.legacy).toBe(false);
        Vitest.expect(labels(result.chain)).toStrictEqual([]);
        Vitest.expect(result.issues).toStrictEqual([
          {
            field: 'triggers[0]',
            message: "unknown trigger 'nope'",
            fix: `use one of ${FallbackTrigger.all.join(', ')}`,
          },
        ]);
      }),
    ),
  );
});
