import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { FallbackFile, FallbackTrigger, ModelChain } from '../../../modules/index.js';
import { show } from '../index.js';

const withTempDir = <A, E>(use: (root: string) => Effect.Effect<A, E>): Effect.Effect<A, E> =>
  Effect.gen(function* () {
    const root = yield* Effect.promise(() => mkdtemp(join(tmpdir(), 'mf-fallback-')));
    return yield* use(root).pipe(
      Effect.ensuring(Effect.promise(() => rm(root, { recursive: true, force: true }))),
    );
  });

const labels = (chain: ReadonlyArray<ModelChain.Ref>): ReadonlyArray<string> =>
  chain.map((ref) => ModelChain.label(ref));

Vitest.describe('Engines.show runtime', () => {
  Vitest.it.effect('reports present: false and an idle chain on an empty directory', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const result = yield* show({ cwd: root });

        Vitest.expect(result.present).toBe(false);
        Vitest.expect(result.path).toBe(FallbackFile.locate(root));
        Vitest.expect(result.chain).toStrictEqual([]);
        Vitest.expect(result.triggers).toStrictEqual(FallbackTrigger.defaults);
      }),
    ),
  );

  Vitest.it.effect('reports the configured chain and triggers', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* FallbackFile.write(root, {
          chain: ModelChain.parse(['a/one', 'b/two']),
          triggers: ['auth', 'quota'],
        });

        const result = yield* show({ cwd: root });

        Vitest.expect(result.present).toBe(true);
        Vitest.expect(labels(result.chain)).toStrictEqual(['a/one', 'b/two']);
        Vitest.expect(result.triggers).toStrictEqual(['auth', 'quota']);
      }),
    ),
  );
});
