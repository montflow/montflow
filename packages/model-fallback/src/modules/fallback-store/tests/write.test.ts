import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { FallbackTrigger } from '../../fallback-trigger/index.js';
import { ModelChain } from '../../model-chain/index.js';
import { FallbackStore } from '../index.js';

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

const readText = (root: string): Effect.Effect<string> =>
  Effect.promise(() => readFile(FallbackStore.file(root), 'utf8'));

Vitest.describe('FallbackStore.write runtime', () => {
  Vitest.it.effect('creates the store file, and its parents, from nothing', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const written = yield* FallbackStore.write(root, {
          chain: ModelChain.parse(['a/one', 'b/two']),
          triggers: ['auth'],
        });

        Vitest.expect(written).toStrictEqual({ path: FallbackStore.file(root), changed: true });
        Vitest.expect(existsSync(FallbackStore.file(root))).toBe(true);
        Vitest.expect(JSON.parse(yield* readText(root))).toStrictEqual({
          version: 1,
          chain: ['a/one', 'b/two'],
          triggers: ['auth'],
        });
      }),
    ),
  );

  Vitest.it.effect('writes the default triggers when they are passed through', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* FallbackStore.write(root, {
          chain: ModelChain.parse(['a/one']),
          triggers: FallbackTrigger.defaults,
        });

        const document = yield* FallbackStore.read(root);

        Vitest.expect(document.present).toBe(true);
        Vitest.expect(document.issues).toStrictEqual([]);
        Vitest.expect(document.config).toStrictEqual({
          chain: ModelChain.parse(['a/one']),
          triggers: FallbackTrigger.defaults,
        });
      }),
    ),
  );

  Vitest.it.effect('preserves unknown top-level keys and reports the bytes moved', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedStore(
          root,
          '{"future":{"keep":true},"chain":["old/model"],"triggers":["quota"]}\n',
        );

        const written = yield* FallbackStore.write(root, {
          chain: ModelChain.parse(['a/one']),
          triggers: ['auth'],
        });

        Vitest.expect(written.changed).toBe(true);
        Vitest.expect(JSON.parse(yield* readText(root))).toStrictEqual({
          future: { keep: true },
          version: 1,
          chain: ['a/one'],
          triggers: ['auth'],
        });
      }),
    ),
  );

  Vitest.it.effect('is idempotent: a repeat write reports changed: false and keeps the bytes', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const config: FallbackStore.Config = {
          chain: ModelChain.parse(['a/one', 'b/two']),
          triggers: ['auth'],
        };
        const first = yield* FallbackStore.write(root, config);
        const before = yield* readText(root);

        const second = yield* FallbackStore.write(root, config);

        Vitest.expect(first.changed).toBe(true);
        Vitest.expect(second).toStrictEqual({ path: first.path, changed: false });
        Vitest.expect(yield* readText(root)).toBe(before);
      }),
    ),
  );

  Vitest.it.effect('writes an explicit empty triggers array', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* FallbackStore.write(root, {
          chain: ModelChain.parse(['a/one']),
          triggers: [],
        });

        const document = yield* FallbackStore.read(root);

        Vitest.expect(document.issues).toStrictEqual([]);
        Vitest.expect(document.config.triggers).toStrictEqual([]);
      }),
    ),
  );

  Vitest.it.effect('refuses to overwrite a store that is not valid JSON', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedStore(root, '{ "chain": [ }\n');

        const error = yield* FallbackStore.write(root, {
          chain: ModelChain.parse(['a/one']),
          triggers: ['auth'],
        }).pipe(Effect.flip);

        Vitest.expect(error).toBeInstanceOf(FallbackStore.StoreError);
        Vitest.expect(error.reason).toContain('is not valid JSON; fix it before writing');
      }),
    ),
  );
});
