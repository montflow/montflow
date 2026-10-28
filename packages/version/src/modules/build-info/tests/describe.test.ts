import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeServices } from '@effect/platform-node';
import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as BuildInfo from '../index.js';

/**
 * Identity against real repositories rather than a mocked git: the contract is
 * about what a checkout on disk actually says, and every degradation path
 * (missing manifest, non-git directory) is a real filesystem shape.
 */

/** One throwaway package directory. */
interface Sandbox {
  readonly root: string;
}

/** Build a throwaway package directory and remove it afterwards. */
const withSandbox = <A, E>(use: (sandbox: Sandbox) => Effect.Effect<A, E>): Effect.Effect<A, E> =>
  Effect.acquireUseRelease(
    Effect.promise(async () => {
      const root = await mkdtemp(join(tmpdir(), 'mf-build-info-'));
      return { root };
    }),
    use,
    (sandbox) => Effect.promise(() => rm(sandbox.root, { recursive: true, force: true })),
  );

/** Write a `package.json` with the given name and version. */
const writeManifest = (root: string, name: string, version: string): Promise<void> =>
  writeFile(join(root, 'package.json'), `${JSON.stringify({ name, version }, null, 2)}\n`);

/** Run git in a directory and fail loudly when the fixture cannot be built. */
const git = (cwd: string, args: ReadonlyArray<string>): string => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
};

/** Initialise a repository with one commit holding `file`. */
const initRepo = async (root: string, file: string, contents: string): Promise<void> => {
  await writeFile(join(root, file), contents);
  git(root, ['init', '-b', 'main']);
  git(root, ['add', '.']);
  git(root, [
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '-m',
    'initial',
  ]);
};

/** The identity effect with the Node platform layer every CLI provides. */
const identity = (packageRoot: string) =>
  BuildInfo.describe({ packageRoot }).pipe(Effect.provide(NodeServices.layer));

Vitest.describe('BuildInfo.describe runtime', () => {
  Vitest.it.effect('reports the package version and the checkout commit', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => writeManifest(sandbox.root, '@montflow/skills', '1.2.3'));
        yield* Effect.promise(() => initRepo(sandbox.root, 'SKILL.md', '# skill\n'));
        const expected = git(sandbox.root, ['rev-parse', 'HEAD']);

        const found = yield* identity(sandbox.root);

        Vitest.expect(found).toStrictEqual({
          name: '@montflow/skills',
          version: '1.2.3',
          commit: expected,
          dirty: false,
          ref: 'main',
          checkout: sandbox.root,
          source: 'package',
        });
      }),
    ),
  );

  Vitest.it.effect('marks a checkout with an edited file dirty', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => writeManifest(sandbox.root, '@montflow/specs', '0.4.0'));
        yield* Effect.promise(() => initRepo(sandbox.root, 'README.md', '# clean\n'));
        yield* Effect.promise(() => writeFile(join(sandbox.root, 'README.md'), '# edited\n'));

        const found = yield* identity(sandbox.root);

        Vitest.expect(found.dirty).toBe(true);
      }),
    ),
  );

  Vitest.it.effect('degrades to name, version, and checkout outside git', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => writeManifest(sandbox.root, '@montflow/prompts', '2.0.0'));

        const found = yield* identity(sandbox.root);

        Vitest.expect(found.name).toBe('@montflow/prompts');
        Vitest.expect(found.version).toBe('2.0.0');
        Vitest.expect(found.checkout).toBe(sandbox.root);
        Vitest.expect(found.source).toBe('package');
        Vitest.expect('commit' in found).toBe(true);
        Vitest.expect(found.commit).toBeUndefined();
        Vitest.expect(found.dirty).toBeUndefined();
        Vitest.expect(found.ref).toBeUndefined();
      }),
    ),
  );

  Vitest.it.effect('fails with a readable message when package.json is absent', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => mkdir(join(sandbox.root, 'nested'), { recursive: true }));

        const message = yield* identity(join(sandbox.root, 'nested')).pipe(Effect.flip);

        Vitest.expect(message).toContain('build-info: cannot read a package.json');
        Vitest.expect(message).toContain(join(sandbox.root, 'nested'));
      }),
    ),
  );

  Vitest.it.effect('uses a generated identity when the manifest is not on disk', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        const found = yield* BuildInfo.describe({
          packageRoot: join(sandbox.root, 'compiled'),
          generated: { name: '@montflow/reviews', version: '3.1.0' },
        }).pipe(Effect.provide(NodeServices.layer));

        Vitest.expect(found.name).toBe('@montflow/reviews');
        Vitest.expect(found.version).toBe('3.1.0');
        Vitest.expect(found.source).toBe('generated');
        Vitest.expect(found.commit).toBeUndefined();
      }),
    ),
  );

  Vitest.it.effect('does not create files in the package directory', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => writeManifest(sandbox.root, '@montflow/profiles', '0.0.1'));
        yield* Effect.promise(() => initRepo(sandbox.root, 'profile.md', '# profile\n'));
        const before = git(sandbox.root, ['status', '--porcelain']);

        yield* identity(sandbox.root);

        Vitest.expect(git(sandbox.root, ['status', '--porcelain'])).toBe(before);
      }),
    ),
  );
});
