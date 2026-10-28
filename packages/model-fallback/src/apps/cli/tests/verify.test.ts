import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { FallbackFile, ModelCatalog, ModelChain } from '../../../modules/index.js';
import type { Deps } from '../index.js';
import { verify } from '../index.js';

const withTempDir = <A, E>(use: (root: string) => Effect.Effect<A, E>): Effect.Effect<A, E> =>
  Effect.gen(function* () {
    const root = yield* Effect.promise(() => mkdtemp(join(tmpdir(), 'mf-fallback-')));
    return yield* use(root).pipe(
      Effect.ensuring(Effect.promise(() => rm(root, { recursive: true, force: true }))),
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
  candidate('c', 'three'),
];

const deps = (candidates: ReadonlyArray<ModelCatalog.Candidate>): Deps => ({
  catalog: () => Effect.succeed(candidates),
  preferences: () => Effect.succeed({ favorite: [], recent: [], variant: new Map() }),
});

const labels = (chain: ReadonlyArray<ModelChain.Ref>): ReadonlyArray<string> =>
  chain.map((ref) => ModelChain.label(ref));

Vitest.describe('Engines.verify runtime', () => {
  Vitest.it.effect('fails pointing at set when no chain is configured', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const error = yield* verify({ cwd: root }, deps(catalog)).pipe(Effect.flip);

        Vitest.expect(error).toBe(
          `No fallback chain configured in ${FallbackFile.locate(root)}. Run \`mf-model-fallback set --chain ...\`.`,
        );
      }),
    ),
  );

  Vitest.it.effect('fails listing every model the catalog does not know', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* FallbackFile.write(root, {
          chain: ModelChain.parse(['a/one', 'z/unknown']),
          triggers: ['auth'],
        });

        const error = yield* verify({ cwd: root }, deps(catalog)).pipe(Effect.flip);

        Vitest.expect(error).toBe(
          `Unknown model(s) in ${FallbackFile.locate(root)}: z/unknown. Run \`mf-model-fallback models\` and update the chain.`,
        );
      }),
    ),
  );

  Vitest.it.effect('passes when every model resolves', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* FallbackFile.write(root, {
          chain: ModelChain.parse(['a/one', 'b/two']),
          triggers: ['auth'],
        });

        const result = yield* verify({ cwd: root }, deps(catalog));

        Vitest.expect(result.path).toBe(FallbackFile.locate(root));
        Vitest.expect(labels(result.chain)).toStrictEqual(['a/one', 'b/two']);
        Vitest.expect(result.triggers).toStrictEqual(['auth']);
        Vitest.expect(result.catalog).toBe(3);
      }),
    ),
  );
});
