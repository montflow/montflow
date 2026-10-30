import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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

const legacy = (): FallbackStore.Config => ({
  chain: ModelChain.parse(['b/two']),
  triggers: ['quota'],
});

Vitest.describe('FallbackStore.resolve runtime', () => {
  Vitest.it.effect('prefers a valid store over legacy options', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedStore(root, '{"version":1,"chain":["a/one"],"triggers":["auth"]}\n');

        const snapshot = yield* FallbackStore.resolveWith(root, legacy());

        Vitest.expect(snapshot).toStrictEqual({
          path: FallbackStore.file(root),
          present: true,
          source: 'store',
          config: { chain: ModelChain.parse(['a/one']), triggers: ['auth'] },
          issues: [],
          legacy: true,
        });
      }),
    ),
  );

  Vitest.it.effect('reports legacy: false when a valid store stands alone', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedStore(root, '{"version":1,"chain":["a/one"],"triggers":["auth"]}\n');

        const snapshot = yield* FallbackStore.resolveWith(root, undefined);

        Vitest.expect(snapshot.source).toBe('store');
        Vitest.expect(snapshot.legacy).toBe(false);
      }),
    ),
  );

  Vitest.it.effect('uses legacy options when no store exists', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const snapshot = yield* FallbackStore.resolveWith(root, legacy());

        Vitest.expect(snapshot).toStrictEqual({
          path: FallbackStore.file(root),
          present: false,
          source: 'options',
          config: legacy(),
          issues: [],
          legacy: false,
        });
      }),
    ),
  );

  Vitest.it.effect('reports source none when neither store nor options configure a chain', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const snapshot = yield* FallbackStore.resolveWith(root, undefined);

        Vitest.expect(snapshot).toStrictEqual({
          path: FallbackStore.file(root),
          present: false,
          source: 'none',
          config: FallbackStore.idle,
          issues: [],
          legacy: false,
        });
      }),
    ),
  );

  Vitest.it.effect('falls back to options when the store is invalid and carries its issues', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedStore(root, '{"chain":[]}\n');

        const snapshot = yield* FallbackStore.resolveWith(root, legacy());

        Vitest.expect(snapshot).toStrictEqual({
          path: FallbackStore.file(root),
          present: true,
          source: 'options',
          config: legacy(),
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

  Vitest.it.effect('reports source none with the store issues when there are no options', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedStore(root, '{"version":2,"chain":["a/one"]}\n');

        const snapshot = yield* FallbackStore.resolveWith(root, undefined);

        Vitest.expect(snapshot).toStrictEqual({
          path: FallbackStore.file(root),
          present: true,
          source: 'none',
          config: FallbackStore.idle,
          issues: [
            {
              field: 'version',
              message: 'expected 1',
              fix: 'set version to 1 or delete the field',
            },
          ],
          legacy: false,
        });
      }),
    ),
  );

  Vitest.it.effect('decodes host options through resolve', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const snapshot = yield* FallbackStore.resolve(root, {
          chain: ['b/two'],
          triggers: ['auth'],
        });

        Vitest.expect(snapshot).toStrictEqual({
          path: FallbackStore.file(root),
          present: false,
          source: 'options',
          config: { chain: ModelChain.parse(['b/two']), triggers: ['auth'] },
          issues: [],
          legacy: false,
        });
      }),
    ),
  );

  Vitest.it.effect('treats unusable options as no options', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const emptyChain = yield* FallbackStore.resolve(root, { chain: [] });
        const noChain = yield* FallbackStore.resolve(root, { triggers: ['auth'] });

        Vitest.expect(emptyChain.source).toBe('none');
        Vitest.expect(emptyChain.config).toStrictEqual(FallbackStore.idle);
        Vitest.expect(noChain.source).toBe('none');
        Vitest.expect(noChain.config).toStrictEqual(FallbackStore.idle);
      }),
    ),
  );

  Vitest.it.effect('defaults the triggers of options that omit them', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const snapshot = yield* FallbackStore.resolve(root, { chain: ['b/two'] });

        Vitest.expect(snapshot.source).toBe('options');
        Vitest.expect(snapshot.config.triggers).toStrictEqual(FallbackTrigger.defaults);
      }),
    ),
  );

  Vitest.it.effect('treats malformed JSON as an issue and still uses legacy options', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedStore(root, '{ "chain": [ }\n');

        const snapshot = yield* FallbackStore.resolveWith(root, legacy());

        Vitest.expect(snapshot).toStrictEqual({
          path: FallbackStore.file(root),
          present: true,
          source: 'options',
          config: legacy(),
          issues: [
            {
              field: '$',
              message: 'file is not valid JSON',
              fix: 'fix the JSON by hand or delete the file',
            },
          ],
          legacy: false,
        });
      }),
    ),
  );

  Vitest.it.effect('reports invalid legacy options as an options issue', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const snapshot = yield* FallbackStore.resolve(root, {
          chain: ['b/two'],
          triggers: ['qouta'],
        });

        Vitest.expect(snapshot.source).toBe('none');
        Vitest.expect(snapshot.config).toStrictEqual(FallbackStore.idle);
        Vitest.expect(snapshot.issues).toHaveLength(1);
        Vitest.expect(snapshot.issues[0]).toMatchObject({
          field: 'options',
          fix: 'fix the opencode.jsonc options by hand, then run mf-model-fallback migrate',
        });
        Vitest.expect(snapshot.issues[0]?.message).toContain("Unknown fallback trigger 'qouta'.");
      }),
    ),
  );

  Vitest.it.effect('adds the options issue when the store is also invalid', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedStore(root, '{"chain":[]}\n');

        const snapshot = yield* FallbackStore.resolve(root, {
          chain: ['b/two'],
          triggers: ['qouta'],
        });

        Vitest.expect(snapshot.source).toBe('none');
        Vitest.expect(snapshot.issues.map((issue) => issue.field)).toStrictEqual([
          'chain',
          'options',
        ]);
      }),
    ),
  );

  Vitest.it.effect('reports an unreadable store path as a $ issue instead of failing', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => mkdir(FallbackStore.file(root), { recursive: true }));

        const snapshot = yield* FallbackStore.resolveWith(root, legacy());

        Vitest.expect(snapshot.present).toBe(true);
        Vitest.expect(snapshot.source).toBe('options');
        Vitest.expect(snapshot.config).toStrictEqual(legacy());
        Vitest.expect(snapshot.issues).toHaveLength(1);
        Vitest.expect(snapshot.issues[0]?.field).toBe('$');
        Vitest.expect(snapshot.issues[0]?.message).toContain('Could not read');
      }),
    ),
  );
});
