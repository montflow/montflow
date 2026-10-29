import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect, Ref } from 'effect';
import { FallbackStore, FallbackTrigger, ModelChain } from '../../../modules/index.js';
import { reload } from '../model-fallback.apps.module.js';

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

/** The `options` block the host parses from the legacy `opencode.jsonc` plugin entry. */
const legacyOptions = () => ({ chain: ['b/two'] });

/** A configuration already in force before the store is edited. */
const inForce = (): FallbackStore.Config => ({
  chain: ModelChain.parse(['a/one']),
  triggers: ['auth'],
});

Vitest.describe('server reload runtime', () => {
  Vitest.it.effect('replaces the active chain when a valid store appears', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const current = yield* Ref.make<FallbackStore.Config>(FallbackStore.idle);
        yield* seedStore(root, '{"version":1,"chain":["a/one","b/two"],"triggers":["auth"]}\n');

        yield* reload(root, legacyOptions(), current);

        const active = yield* Ref.get(current);
        Vitest.expect(active).toStrictEqual({
          chain: ModelChain.parse(['a/one', 'b/two']),
          triggers: ['auth'],
        });
      }),
    ),
  );

  Vitest.it.effect('keeps the chain in force when the store has a shape issue', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const current = yield* Ref.make<FallbackStore.Config>(inForce());

        yield* seedStore(root, '{"chain":"nope"}\n');
        yield* reload(root, legacyOptions(), current);
        Vitest.expect(yield* Ref.get(current)).toStrictEqual(inForce());

        yield* seedStore(root, '{"chain":["a/one"],"triggers":["nope"]}\n');
        yield* reload(root, legacyOptions(), current);
        Vitest.expect(yield* Ref.get(current)).toStrictEqual(inForce());
      }),
    ),
  );

  Vitest.it.effect('keeps the chain in force when the store is malformed JSON', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const current = yield* Ref.make<FallbackStore.Config>(inForce());
        yield* seedStore(root, '{ "chain": [ }\n');

        yield* reload(root, legacyOptions(), current);

        Vitest.expect(yield* Ref.get(current)).toStrictEqual(inForce());
      }),
    ),
  );

  Vitest.it.effect('falls back to the legacy options when the store is deleted', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const current = yield* Ref.make<FallbackStore.Config>(FallbackStore.idle);
        yield* seedStore(root, '{"version":1,"chain":["a/one"],"triggers":["auth"]}\n');
        yield* reload(root, legacyOptions(), current);
        Vitest.expect(yield* Ref.get(current)).toStrictEqual(inForce());

        yield* FallbackStore.remove(root);
        yield* reload(root, legacyOptions(), current);

        Vitest.expect(yield* Ref.get(current)).toStrictEqual({
          chain: ModelChain.parse(['b/two']),
          triggers: FallbackTrigger.defaults,
        });
      }),
    ),
  );

  Vitest.it.effect('falls back to idle when the store is deleted and no options exist', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const current = yield* Ref.make<FallbackStore.Config>(FallbackStore.idle);
        yield* seedStore(root, '{"version":1,"chain":["a/one"],"triggers":["auth"]}\n');
        yield* reload(root, {}, current);
        Vitest.expect(yield* Ref.get(current)).toStrictEqual(inForce());

        yield* FallbackStore.remove(root);
        yield* reload(root, {}, current);

        Vitest.expect(yield* Ref.get(current)).toStrictEqual(FallbackStore.idle);
      }),
    ),
  );
});
