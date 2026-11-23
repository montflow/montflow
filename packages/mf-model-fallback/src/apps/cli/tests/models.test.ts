import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { ModelCatalog } from '../../../modules/index.js';
import type { Deps } from '../index.js';
import { models } from '../index.js';

const withTempDir = <A, E>(use: (root: string) => Effect.Effect<A, E>): Effect.Effect<A, E> =>
  Effect.gen(function* () {
    const root = yield* Effect.promise(() => mkdtemp(join(tmpdir(), 'mf-fallback-')));
    return yield* use(root).pipe(
      Effect.ensuring(Effect.promise(() => rm(root, { recursive: true, force: true }))),
    );
  });

const candidate = (
  providerID: string,
  modelID: string,
  outputCost: number,
): ModelCatalog.Candidate => ({
  label: `${providerID}/${modelID}`,
  providerID,
  modelID,
  name: modelID,
  context: 1000,
  outputCost,
  tools: true,
  status: 'active',
});

const catalog: ReadonlyArray<ModelCatalog.Candidate> = [
  candidate('a', 'one', 1),
  candidate('b', 'two', 2),
  candidate('c', 'three', 3),
  candidate('d', 'four', 4),
];

const deps = (candidates: ReadonlyArray<ModelCatalog.Candidate>): Deps => ({
  catalog: () => Effect.succeed(candidates),
  preferences: () => Effect.succeed({ favorite: [], recent: [], variant: new Map() }),
});

Vitest.describe('Engines.models runtime', () => {
  Vitest.it.effect('returns only limit ranked models and the matching suggestion', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const result = yield* models({ cwd: root }, 2, deps(catalog));

        Vitest.expect(result.available.map((entry) => entry.label)).toStrictEqual([
          'a/one',
          'b/two',
        ]);
        Vitest.expect(result.suggested).toStrictEqual(['a/one', 'b/two']);
      }),
    ),
  );

  Vitest.it.effect('never suggests more than three models, even with a larger limit', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const result = yield* models({ cwd: root }, 10, deps(catalog));

        Vitest.expect(result.available.map((entry) => entry.label)).toStrictEqual([
          'a/one',
          'b/two',
          'c/three',
          'd/four',
        ]);
        Vitest.expect(result.suggested).toStrictEqual(['a/one', 'b/two', 'c/three']);
      }),
    ),
  );

  Vitest.it.effect('surfaces the catalog failure as the engine error', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const failing: Deps = {
          catalog: () => Effect.fail(new ModelCatalog.CatalogError({ reason: 'offline' })),
          preferences: () => Effect.succeed({ favorite: [], recent: [], variant: new Map() }),
        };

        const error = yield* models({ cwd: root }, 5, failing).pipe(Effect.flip);

        Vitest.expect(error).toBe('offline');
      }),
    ),
  );
});
