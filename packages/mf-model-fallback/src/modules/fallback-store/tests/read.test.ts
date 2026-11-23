import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { ModelChain } from '../../model-chain/index.js';
import { FallbackStore } from '../index.js';

/** uid 0 reads a `chmod 000` file, so the permission case cannot fail as root. */
const isRoot = process.getuid?.() === 0;

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

Vitest.describe('FallbackStore.read runtime', () => {
  Vitest.it.effect('reads a missing file as absent with no issues', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const document = yield* FallbackStore.read(root);

        Vitest.expect(document).toStrictEqual({
          present: false,
          config: FallbackStore.idle,
          issues: [],
        });
      }),
    ),
  );

  Vitest.it.effect('reads and decodes an existing store', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedStore(
          root,
          '{"version":1,"chain":["a/one","b/two"],"triggers":["auth","quota"]}\n',
        );

        const document = yield* FallbackStore.read(root);

        Vitest.expect(document.present).toBe(true);
        Vitest.expect(document.issues).toStrictEqual([]);
        Vitest.expect(document.config).toStrictEqual({
          chain: ModelChain.parse(['a/one', 'b/two']),
          triggers: ['auth', 'quota'],
        });
      }),
    ),
  );

  Vitest.it.effect('carries shape issues for an existing but invalid store', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedStore(root, '{"chain":[]}\n');

        const document = yield* FallbackStore.read(root);

        Vitest.expect(document.present).toBe(true);
        Vitest.expect(document.config).toStrictEqual(FallbackStore.idle);
        Vitest.expect(document.issues).toStrictEqual([
          {
            field: 'chain',
            message: 'chain must not be empty; delete the file to disable',
            fix: 'run mf-model-fallback set --chain <provider/model>,...',
          },
        ]);
      }),
    ),
  );

  Vitest.it.effect('reports an unreadable store as a $ issue instead of failing', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => mkdir(FallbackStore.file(root), { recursive: true }));

        const document = yield* FallbackStore.read(root);

        Vitest.expect(document.present).toBe(true);
        Vitest.expect(document.config).toStrictEqual(FallbackStore.idle);
        Vitest.expect(document.issues).toHaveLength(1);
        Vitest.expect(document.issues[0]?.field).toBe('$');
        Vitest.expect(document.issues[0]?.message).toContain('Could not read');
      }),
    ),
  );

  Vitest.it.effect('reports a directory at the store file path as present with a $ issue', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedStore(root, '{"version":1,"chain":["a/one"]}\n');
        const before = yield* FallbackStore.read(root);
        Vitest.expect(before.issues).toStrictEqual([]);
        const target = FallbackStore.file(root);
        yield* Effect.promise(async () => {
          await rm(target, { force: true });
          await mkdir(target, { recursive: true });
        });

        const document = yield* FallbackStore.read(root);

        Vitest.expect(document.present).toBe(true);
        Vitest.expect(document.config).toStrictEqual(FallbackStore.idle);
        Vitest.expect(document.issues).toHaveLength(1);
        Vitest.expect(document.issues[0]?.field).toBe('$');
        Vitest.expect(document.issues[0]?.message).toContain('Could not read');
      }),
    ),
  );

  Vitest.it.effect.skipIf(isRoot)(
    'reports a permission-denied store as present with a $ issue (F27)',
    () =>
      withTempDir((root) =>
        Effect.gen(function* () {
          yield* seedStore(root, '{"version":1,"chain":["a/one"],"triggers":["auth"]}\n');
          const directory = FallbackStore.directory(root);
          yield* Effect.promise(() => chmod(directory, 0o000));

          const document = yield* FallbackStore.read(root).pipe(
            Effect.ensuring(Effect.promise(() => chmod(directory, 0o700))),
          );

          Vitest.expect(document.present).toBe(true);
          Vitest.expect(document.config).toStrictEqual(FallbackStore.idle);
          Vitest.expect(document.issues).toHaveLength(1);
          Vitest.expect(document.issues[0]?.field).toBe('$');
          Vitest.expect(document.issues[0]?.message).toContain('Could not read');
        }),
      ),
  );

  Vitest.it.effect('reports malformed JSON as an issue instead of failing', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* seedStore(root, '{ "chain": [ }\n');

        const document = yield* FallbackStore.read(root);

        Vitest.expect(document).toStrictEqual({
          present: true,
          config: FallbackStore.idle,
          issues: [
            {
              field: '$',
              message: 'file is not valid JSON',
              fix: 'fix the JSON by hand or delete the file',
            },
          ],
        });
      }),
    ),
  );
});
