import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { FallbackStore, FallbackTrigger, ModelChain } from '../../../modules/index.js';
import { status } from '../index.js';

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

Vitest.describe('Engines.status runtime', () => {
  Vitest.it.effect('reports ok for a valid store, with the full shape', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedStore(root, '{"version":1,"chain":["a/one"],"triggers":["auth"]}\n');

        const result = yield* status({ cwd: root });

        Vitest.expect(result).toStrictEqual({
          ok: true,
          path: FallbackStore.file(root),
          present: true,
          source: 'store',
          chain: ModelChain.parse(['a/one']),
          triggers: ['auth'],
          issues: [],
          legacy: false,
        });
      }),
    ),
  );

  Vitest.it.effect('ignores a malformed host config when a valid store exists', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedStore(root, '{"version":1,"chain":["a/one"],"triggers":["auth"]}\n');
        yield* Effect.promise(() =>
          writeFile(join(root, 'opencode.jsonc'), '{ "plugins": [ }', 'utf8'),
        );

        const result = yield* status({ cwd: root });

        Vitest.expect(result).toStrictEqual({
          ok: true,
          path: FallbackStore.file(root),
          present: true,
          source: 'store',
          chain: ModelChain.parse(['a/one']),
          triggers: ['auth'],
          issues: [],
          legacy: false,
        });
      }),
    ),
  );

  Vitest.it.effect('reports ok for a workspace with no store at all', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const result = yield* status({ cwd: root });

        Vitest.expect(result).toStrictEqual({
          ok: true,
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

  Vitest.it.effect('reports ok for legacy options while no store exists', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedOptions(root, '{"chain":["b/two"]}');

        const result = yield* status({ cwd: root });

        Vitest.expect(result.ok).toBe(true);
        Vitest.expect(result.source).toBe('options');
        Vitest.expect(result.chain).toStrictEqual(ModelChain.parse(['b/two']));
        Vitest.expect(result.legacy).toBe(false);
      }),
    ),
  );

  Vitest.it.effect('reports ok when a valid store shadows legacy options', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedStore(root, '{"version":1,"chain":["a/one"],"triggers":["auth"]}\n');
        yield* seedOptions(root, '{"chain":["b/two"]}');

        const result = yield* status({ cwd: root });

        Vitest.expect(result.ok).toBe(true);
        Vitest.expect(result.source).toBe('store');
        Vitest.expect(result.chain).toStrictEqual(ModelChain.parse(['a/one']));
        Vitest.expect(result.legacy).toBe(true);
      }),
    ),
  );

  Vitest.it.effect('reports not ok when a store exists with an unusable chain', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedStore(root, '{"chain":[]}\n');

        const result = yield* status({ cwd: root });

        Vitest.expect(result).toStrictEqual({
          ok: false,
          path: FallbackStore.file(root),
          present: true,
          source: 'none',
          chain: [],
          triggers: FallbackTrigger.defaults,
          issues: [
            {
              field: 'chain',
              message: 'chain must not be empty; delete the file to disable',
              fix: 'run mf-model-fallback set --chain <provider/model>,...',
            },
          ],
          legacy: false,
        });
      }),
    ),
  );

  Vitest.it.effect('reports not ok when the store is not valid JSON', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedStore(root, '{ "chain": [ }\n');

        const result = yield* status({ cwd: root });

        Vitest.expect(result.ok).toBe(false);
        Vitest.expect(result.issues).toStrictEqual([
          {
            field: '$',
            message: 'file is not valid JSON',
            fix: 'fix the JSON by hand or delete the file',
          },
        ]);
      }),
    ),
  );

  Vitest.it.effect('reports not ok when a store names an unknown trigger', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedStore(root, '{"chain":["a/one"],"triggers":["nope"]}\n');

        const result = yield* status({ cwd: root });

        Vitest.expect(result.ok).toBe(false);
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

  Vitest.it.effect('scopes the store lookup to the given directory', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedStore(root, '{"version":1,"chain":["a/one"],"triggers":["auth"]}\n');
        const nested = join(root, 'workspace');

        const atRoot = yield* status({ cwd: root });
        const atNested = yield* status({ cwd: nested });

        Vitest.expect(atRoot.path).toBe(FallbackStore.file(root));
        Vitest.expect(atRoot.present).toBe(true);
        Vitest.expect(atNested.path).toBe(FallbackStore.file(nested));
        Vitest.expect(atNested.present).toBe(false);
        Vitest.expect(atNested.source).toBe('none');
      }),
    ),
  );

  Vitest.it.effect('never needs a catalog host, even when a server is passed', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedStore(root, '{"version":1,"chain":["z/offline"],"triggers":["auth"]}\n');

        const result = yield* status({ cwd: root, server: 'http://127.0.0.1:9' });

        Vitest.expect(result.ok).toBe(true);
        Vitest.expect(result.chain).toStrictEqual(ModelChain.parse(['z/offline']));
      }),
    ),
  );
});
