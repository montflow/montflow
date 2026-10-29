import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { FallbackStore, ModelCatalog, ModelChain } from '../../../modules/index.js';
import type { Deps } from '../index.js';
import { set } from '../index.js';

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
  Effect.promise(async () => {
    const target = join(root, 'opencode.jsonc');
    await mkdir(dirname(target), { recursive: true });
    await writeFile(
      target,
      `{"plugins":[{"package":"@montflow/model-fallback","options":${options}}]}\n`,
      'utf8',
    );
  });

const candidate = (providerID: string, modelID: string): ModelCatalog.Candidate => ({
  label: `${providerID}/${modelID}`,
  providerID,
  modelID,
  name: modelID,
  context: 1000,
  outputCost: 1,
  tools: true,
  status: 'active',
});

const catalog: ReadonlyArray<ModelCatalog.Candidate> = [
  candidate('a', 'one'),
  candidate('b', 'two'),
];

const deps = (candidates: ReadonlyArray<ModelCatalog.Candidate>): Deps => ({
  catalog: () => Effect.succeed(candidates),
  preferences: () => Effect.succeed({ favorite: [], recent: [], variant: new Map() }),
});

const offline: Deps = {
  catalog: () => Effect.fail(new ModelCatalog.CatalogError({ reason: 'offline' })),
  preferences: () => Effect.succeed({ favorite: [], recent: [], variant: new Map() }),
};

const labels = (chain: ReadonlyArray<ModelChain.Ref>): ReadonlyArray<string> =>
  chain.map((ref) => ModelChain.label(ref));

Vitest.describe('Engines.set runtime', () => {
  Vitest.it.effect('writes the store, not opencode.jsonc, with the default triggers', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const result = yield* set(
          { cwd: root },
          { chain: ['a/one', 'b/two'], triggers: undefined, allowUnknown: false },
          deps(catalog),
        );

        Vitest.expect(result).toStrictEqual({
          path: FallbackStore.file(root),
          changed: true,
          chain: ModelChain.parse(['a/one', 'b/two']),
          triggers: ['quota', 'rate-limit', 'auth'],
          unknown: [],
          checked: true,
          note: undefined,
          legacy: false,
        });
        Vitest.expect(existsSync(FallbackStore.file(root))).toBe(true);
        Vitest.expect(existsSync(join(root, 'opencode.jsonc'))).toBe(false);

        const current = yield* FallbackStore.read(root);
        Vitest.expect(current.present).toBe(true);
        Vitest.expect(labels(current.config.chain)).toStrictEqual(['a/one', 'b/two']);
        Vitest.expect(current.config.triggers).toStrictEqual(['quota', 'rate-limit', 'auth']);
      }),
    ),
  );

  Vitest.it.effect('rejects an unknown model and names the escape hatch', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const error = yield* set(
          { cwd: root },
          { chain: ['a/one', 'z/unknown'], triggers: undefined, allowUnknown: false },
          deps(catalog),
        ).pipe(Effect.flip);

        Vitest.expect(error).toBe(
          'Unknown model(s): z/unknown. Run `mf-model-fallback models`, or pass --allow-unknown.',
        );
        Vitest.expect(existsSync(FallbackStore.file(root))).toBe(false);
      }),
    ),
  );

  Vitest.it.effect('writes an unknown model when allowUnknown is set', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const result = yield* set(
          { cwd: root },
          { chain: ['a/one', 'z/unknown'], triggers: ['auth'], allowUnknown: true },
          deps(catalog),
        );

        Vitest.expect(result.unknown).toStrictEqual(['z/unknown']);
        Vitest.expect(labels(result.chain)).toStrictEqual(['a/one', 'z/unknown']);
        Vitest.expect(result.changed).toBe(true);
        Vitest.expect(labels((yield* FallbackStore.read(root)).config.chain)).toStrictEqual([
          'a/one',
          'z/unknown',
        ]);
      }),
    ),
  );

  Vitest.it.effect('rejects an unknown trigger without writing', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const error = yield* set(
          { cwd: root },
          { chain: ['a/one'], triggers: ['quota', 'nope'], allowUnknown: false },
          deps(catalog),
        ).pipe(Effect.flip);

        Vitest.expect(error).toBe(
          "Unknown trigger 'nope'. Known triggers: quota, rate-limit, auth, timeout, provider-internal, transport.",
        );
        Vitest.expect(existsSync(FallbackStore.file(root))).toBe(false);
      }),
    ),
  );

  Vitest.it.effect('rejects an empty chain without writing', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const error = yield* set(
          { cwd: root },
          { chain: [], triggers: undefined, allowUnknown: false },
          deps(catalog),
        ).pipe(Effect.flip);

        Vitest.expect(error).toBe(
          'Chain is empty. Pass --chain <provider/model>[,<provider/model>...].',
        );
        Vitest.expect(existsSync(FallbackStore.file(root))).toBe(false);
      }),
    ),
  );

  Vitest.it.effect('still writes when the catalog is unreachable, reporting checked: false', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const result = yield* set(
          { cwd: root },
          { chain: ['a/one'], triggers: ['auth'], allowUnknown: false },
          offline,
        );

        Vitest.expect(result.checked).toBe(false);
        Vitest.expect(result.note).toBe('offline');
        Vitest.expect(result.unknown).toStrictEqual([]);
        Vitest.expect(result.changed).toBe(true);
        Vitest.expect(result.legacy).toBe(false);
        Vitest.expect(labels((yield* FallbackStore.read(root)).config.chain)).toStrictEqual([
          'a/one',
        ]);
      }),
    ),
  );

  Vitest.it.effect('reports legacy: true when opencode.jsonc options still exist', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedOptions(root, '{"chain":["b/two"]}');

        const result = yield* set(
          { cwd: root },
          { chain: ['a/one'], triggers: ['auth'], allowUnknown: false },
          deps(catalog),
        );

        Vitest.expect(result.legacy).toBe(true);
        Vitest.expect(labels((yield* FallbackStore.read(root)).config.chain)).toStrictEqual([
          'a/one',
        ]);
      }),
    ),
  );
});
