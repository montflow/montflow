import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { FallbackStore, ModelCatalog, ModelChain } from '../../../modules/index.js';
import type { Deps } from '../index.js';
import { verify } from '../index.js';

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
          `No fallback chain configured (${FallbackStore.file(root)}). Run \`mf-model-fallback set --chain ...\`.`,
        );
      }),
    ),
  );

  Vitest.it.effect('fails naming status when the store is invalid', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedStore(root, '{"chain":[]}\n');

        const error = yield* verify({ cwd: root }, deps(catalog)).pipe(Effect.flip);

        Vitest.expect(error).toBe(
          `${FallbackStore.file(root)} is invalid (chain: chain must not be empty; delete the file to disable). Run \`mf-model-fallback status\` for the full report.`,
        );
      }),
    ),
  );

  Vitest.it.effect('fails listing every model the catalog does not know', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedStore(root, '{"version":1,"chain":["a/one","z/unknown"],"triggers":["auth"]}\n');

        const error = yield* verify({ cwd: root }, deps(catalog)).pipe(Effect.flip);

        Vitest.expect(error).toBe(
          `Unknown model(s) in ${FallbackStore.file(root)}: z/unknown. Run \`mf-model-fallback models\` and update the chain.`,
        );
      }),
    ),
  );

  Vitest.it.effect('passes when every model resolves', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedStore(root, '{"version":1,"chain":["a/one","b/two"],"triggers":["auth"]}\n');

        const result = yield* verify({ cwd: root }, deps(catalog));

        Vitest.expect(result.path).toBe(FallbackStore.file(root));
        Vitest.expect(labels(result.chain)).toStrictEqual(['a/one', 'b/two']);
        Vitest.expect(result.triggers).toStrictEqual(['auth']);
        Vitest.expect(result.catalog).toBe(3);
      }),
    ),
  );

  Vitest.it.effect('verifies legacy options while they are the configuration in force', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedOptions(root, '{"chain":["a/one"]}');

        const result = yield* verify({ cwd: root }, deps(catalog));

        Vitest.expect(result.path).toBe(FallbackStore.file(root));
        Vitest.expect(labels(result.chain)).toStrictEqual(['a/one']);
      }),
    ),
  );
});
