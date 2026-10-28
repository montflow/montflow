import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeServices } from '@effect/platform-node';
import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as BuildInfo from '../../build-info/index.js';
import * as Store from '../../store/index.js';
import * as Cli from '../index.js';

/**
 * Rendering is the contract an agent parses: the human form must name every
 * field, the JSON form must stay one object with stable keys, and the store
 * line must be present only when the workspace actually has a store.
 *
 * Store fixtures are real files on disk, so `Store.read` exercises the same
 * paths the binary does.
 */

const identity: BuildInfo.Identity = {
  name: '@montflow/skills',
  version: '1.4.2',
  commit: 'a'.repeat(40),
  dirty: false,
  ref: 'main',
  checkout: '/checkout',
  source: 'package',
};

/** One throwaway workspace root. */
const withWorkspace = <A, E>(use: (root: string) => Effect.Effect<A, E>): Effect.Effect<A, E> =>
  Effect.acquireUseRelease(
    Effect.promise(() => mkdtemp(join(tmpdir(), 'mf-version-cli-'))),
    use,
    (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
  );

/** Read a workspace store with the platform layer the binary provides. */
const readStore = (root: string): Effect.Effect<Store.StoreState> =>
  Store.read(root).pipe(Effect.provide(NodeServices.layer));

/** Write a manifest into a workspace's skill store. */
const writeManifest = async (root: string): Promise<void> => {
  const store = join(root, '.agents', 'skills');
  await mkdir(store, { recursive: true });
  await writeFile(
    join(store, '.montflow-sync.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        source: {
          path: '/checkout',
          remote: 'https://github.com/montflow/montflow',
          commit: 'b'.repeat(40),
          ref: 'main',
          version: '9.8.7',
        },
        syncedAt: '2026-10-28T00:00:00.000Z',
        skills: [{ name: 'alpha', version: '1.0.0', sha256: 'c'.repeat(64) }],
      },
      null,
      2,
    )}\n`,
  );
};

Vitest.describe('Cli.human runtime', () => {
  Vitest.it.effect('prints every identity field when the workspace has no store', () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const value = Cli.report(identity, yield* readStore(root));

        Vitest.expect(Cli.human(value)).toBe(
          [
            'name      @montflow/skills',
            'version   1.4.2',
            `commit    ${'a'.repeat(40)}`,
            'dirty     no',
            'ref       main',
            'checkout  /checkout',
          ].join('\n'),
        );
      }),
    ),
  );

  Vitest.it.effect('reports a store without a manifest as unmanaged', () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => mkdir(join(root, '.agents', 'skills'), { recursive: true }));

        const value = Cli.report(identity, yield* readStore(root));

        Vitest.expect(Cli.human(value).split('\n').at(-1)).toBe('store     unmanaged');
      }),
    ),
  );

  Vitest.it.effect('reports the manifest source version and commit as the store', () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => writeManifest(root));

        const value = Cli.report(identity, yield* readStore(root));

        Vitest.expect(Cli.human(value).split('\n').at(-1)).toBe(
          `store     9.8.7 (${'b'.repeat(40)})`,
        );
      }),
    ),
  );

  Vitest.it.effect('prints the dirty flag as yes when the tree is dirty', () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const value = Cli.report({ ...identity, dirty: true }, yield* readStore(root));

        Vitest.expect(Cli.human(value)).toContain('dirty     yes');
      }),
    ),
  );
  Vitest.it.effect('reports a corrupt manifest as corrupt, not unmanaged', () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const store = join(root, '.agents', 'skills');
        yield* Effect.promise(() => mkdir(store, { recursive: true }));
        yield* Effect.promise(() => writeFile(join(store, '.montflow-sync.json'), '{ not json'));

        const value = Cli.report(identity, yield* readStore(root));

        Vitest.expect(value.store).toStrictEqual({ status: 'corrupt' });
        Vitest.expect(Cli.human(value).split('\n').at(-1)).toBe('store     corrupt manifest');
      }),
    ),
  );

  Vitest.it.effect('reports a newer manifest schema as unsupported', () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const store = join(root, '.agents', 'skills');
        yield* Effect.promise(() => mkdir(store, { recursive: true }));
        yield* Effect.promise(() =>
          writeFile(
            join(store, '.montflow-sync.json'),
            JSON.stringify({
              schemaVersion: 2,
              source: { path: '/checkout' },
              syncedAt: '2026-10-28T00:00:00.000Z',
              skills: [],
            }),
          ),
        );

        const value = Cli.report(identity, yield* readStore(root));

        Vitest.expect(value.store).toStrictEqual({ status: 'unsupported', schemaVersion: 2 });
      }),
    ),
  );
});

Vitest.it.effect('reports an unreadable manifest as unreadable, not unmanaged', () =>
  withWorkspace((root) =>
    Effect.gen(function* () {
      const store = join(root, '.agents', 'skills');
      yield* Effect.promise(() => mkdir(store, { recursive: true }));
      const manifest = join(store, '.montflow-sync.json');
      // A directory where the manifest belongs fails with EISDIR for every
      // user, including root, so the fixture does not depend on chmod.
      yield* Effect.promise(() => mkdir(manifest, { recursive: true }));

      const value = Cli.report(identity, yield* readStore(root));

      Vitest.expect(value.store).toStrictEqual({ status: 'unreadable' });
      Vitest.expect(Cli.human(value).split('\n').at(-1)).toBe('store     unreadable manifest');
    }),
  ),
);

Vitest.it.effect('reports a shape-changed future manifest as unsupported', () =>
  withWorkspace((root) =>
    Effect.gen(function* () {
      const store = join(root, '.agents', 'skills');
      yield* Effect.promise(() => mkdir(store, { recursive: true }));
      yield* Effect.promise(() =>
        writeFile(
          join(store, '.montflow-sync.json'),
          JSON.stringify({
            schemaVersion: 2,
            origin: { path: '/checkout' },
            syncedAt: '2026-10-28T00:00:00.000Z',
            entries: [],
          }),
        ),
      );

      const value = Cli.report(identity, yield* readStore(root));

      Vitest.expect(value.store).toStrictEqual({ status: 'unsupported', schemaVersion: 2 });
    }),
  ),
);

Vitest.it.effect('reports an older schema as unsupported', () =>
  withWorkspace((root) =>
    Effect.gen(function* () {
      const store = join(root, '.agents', 'skills');
      yield* Effect.promise(() => mkdir(store, { recursive: true }));
      yield* Effect.promise(() =>
        writeFile(join(store, '.montflow-sync.json'), JSON.stringify({ schemaVersion: 0 })),
      );

      const value = Cli.report(identity, yield* readStore(root));

      Vitest.expect(value.store).toStrictEqual({ status: 'unsupported', schemaVersion: 0 });
    }),
  ),
);

Vitest.describe('Cli.json runtime', () => {
  Vitest.it.effect('emits one JSON object with the identity and the store', () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => writeManifest(root));
        const value = Cli.report(identity, yield* readStore(root));

        const parsed: unknown = JSON.parse(Cli.json(value));

        Vitest.expect(parsed).toStrictEqual({
          name: '@montflow/skills',
          version: '1.4.2',
          commit: 'a'.repeat(40),
          dirty: false,
          ref: 'main',
          checkout: '/checkout',
          source: 'package',
          store: {
            status: 'managed',
            version: '9.8.7',
            commit: 'b'.repeat(40),
            syncedAt: '2026-10-28T00:00:00.000Z',
          },
        });
      }),
    ),
  );

  Vitest.it.effect('omits git facts outside a checkout and the store when absent', () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const value = Cli.report(
          {
            name: '@montflow/skills',
            version: '1.4.2',
            checkout: '/checkout',
            source: 'package',
          },
          yield* readStore(root),
        );

        const parsed: unknown = JSON.parse(Cli.json(value));

        Vitest.expect(parsed).toStrictEqual({
          name: '@montflow/skills',
          version: '1.4.2',
          checkout: '/checkout',
          source: 'package',
        });
      }),
    ),
  );
});

Vitest.describe('Cli.versionReport runtime', () => {
  Vitest.it.effect('reports the version the package manifest declares', () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const packageRoot = join(root, 'cli');
        yield* Effect.promise(() => mkdir(packageRoot, { recursive: true }));
        yield* Effect.promise(() =>
          writeFile(
            join(packageRoot, 'package.json'),
            JSON.stringify({ name: '@montflow/skills', version: '9.9.9' }),
          ),
        );

        const value = yield* Cli.versionReport({ packageRoot, dir: root }).pipe(
          Effect.provide(NodeServices.layer),
        );

        Vitest.expect(value.name).toBe('@montflow/skills');
        Vitest.expect(value.version).toBe('9.9.9');
        Vitest.expect(value.source).toBe('package');
      }),
    ),
  );

  Vitest.it.effect('fails with a tagged error when no identity is available', () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const error = yield* Cli.versionReport({
          packageRoot: join(root, 'missing'),
          dir: root,
        }).pipe(Effect.provide(NodeServices.layer), Effect.flip);
        Vitest.expect(error.message).toContain('cannot read a package.json');
      }),
    ),
  );
});

Vitest.describe('Store.read edge cases runtime', () => {
  Vitest.it.effect('reports an unreadable store directory as unreadable', () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        // A file where `.agents` belongs makes the store path ENOTDIR, which is
        // not the same as a missing store.
        yield* Effect.promise(() => writeFile(join(root, '.agents'), 'not a directory\n'));

        const value = Cli.report(identity, yield* readStore(root));

        Vitest.expect(value.store).toStrictEqual({ status: 'unreadable' });
      }),
    ),
  );

  Vitest.it.effect('rejects a non-finite schema version instead of emitting null', () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const store = join(root, '.agents', 'skills');
        yield* Effect.promise(() => mkdir(store, { recursive: true }));
        yield* Effect.promise(() =>
          writeFile(
            join(store, '.montflow-sync.json'),
            '{"schemaVersion":1e999,"source":{"path":"/x"},"syncedAt":"2026-10-28T00:00:00.000Z","skills":[]}',
          ),
        );

        const value = Cli.report(identity, yield* readStore(root));

        Vitest.expect(value.store).toStrictEqual({ status: 'corrupt' });
      }),
    ),
  );
});
