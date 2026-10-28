import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeServices } from '@effect/platform-node';
import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as BuildInfo from '../index.js';

/**
 * Identity against real repositories rather than a mocked git: the contract is
 * about what a checkout on disk actually says, and every degradation path
 * (missing manifest, non-git directory, generated binary identity) is a real
 * filesystem shape.
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
const git = (
  cwd: string,
  args: ReadonlyArray<string>,
  env?: Readonly<Record<string, string>>,
): string => {
  const result =
    env === undefined
      ? spawnSync('git', args, { cwd, encoding: 'utf8' })
      : spawnSync('git', args, { cwd, encoding: 'utf8', env });
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
const identity = (packageRoot: string, env?: Readonly<Record<string, string | undefined>>) =>
  BuildInfo.describe({ packageRoot, env }).pipe(Effect.provide(NodeServices.layer));

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

  Vitest.it.effect('marks an untracked file dirty even when git config hides it', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        const config = join(sandbox.root, 'gitconfig');
        yield* Effect.promise(() => writeFile(config, '[status]\n  showUntrackedFiles = no\n'));
        const packageRoot = join(sandbox.root, 'package');
        yield* Effect.promise(() => mkdir(packageRoot, { recursive: true }));
        yield* Effect.promise(() => writeManifest(packageRoot, '@montflow/skills', '1.2.3'));
        yield* Effect.promise(() => initRepo(packageRoot, 'SKILL.md', '# skill\n'));
        yield* Effect.promise(() => writeFile(join(packageRoot, 'notes.md'), '# untracked\n'));

        const found = yield* identity(packageRoot, { GIT_CONFIG_GLOBAL: config });

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

        const error = yield* identity(join(sandbox.root, 'nested')).pipe(Effect.flip);
        Vitest.expect(error.message).toContain('build-info: cannot read a package.json');
        Vitest.expect(error.message).toContain(join(sandbox.root, 'nested'));
      }),
    ),
  );

  Vitest.it.effect('uses a generated identity without borrowing the enclosing checkout', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => initRepo(sandbox.root, 'README.md', '# repo\n'));
        const packageRoot = join(sandbox.root, 'compiled');
        yield* Effect.promise(() => mkdir(packageRoot, { recursive: true }));

        const found = yield* BuildInfo.describe({
          packageRoot,
          generated: { name: '@montflow/reviews', version: '3.1.0' },
        }).pipe(Effect.provide(NodeServices.layer));

        Vitest.expect(found).toStrictEqual({
          name: '@montflow/reviews',
          version: '3.1.0',
          source: 'generated',
        });
      }),
    ),
  );

  Vitest.it.effect('ignores ambient GIT_DIR exported by the caller', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => writeManifest(sandbox.root, '@montflow/skills', '1.2.3'));
        yield* Effect.promise(() => initRepo(sandbox.root, 'SKILL.md', '# skill\n'));
        const expected = git(sandbox.root, ['rev-parse', 'HEAD']);

        const found = yield* identity(sandbox.root, { GIT_DIR: '.git' });

        Vitest.expect(found.commit).toBe(expected);
        Vitest.expect(found.checkout).toBe(sandbox.root);
        Vitest.expect(found.ref).toBe('main');
      }),
    ),
  );

  Vitest.it.effect('ignores an absolute GIT_DIR pointing at another repository', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        const other = join(sandbox.root, 'other');
        const packageRoot = join(sandbox.root, 'package');
        yield* Effect.promise(() => mkdir(packageRoot, { recursive: true }));
        yield* Effect.promise(() => writeManifest(packageRoot, '@montflow/profiles', '1.0.0'));
        yield* Effect.promise(() => initRepo(packageRoot, 'profile.md', '# profile\n'));
        yield* Effect.promise(() => mkdir(other, { recursive: true }));
        yield* Effect.promise(() => initRepo(other, 'other.md', '# other\n'));
        const expected = git(packageRoot, ['rev-parse', 'HEAD']);

        const found = yield* identity(packageRoot, {
          GIT_DIR: join(other, '.git'),
          GIT_WORK_TREE: other,
        });

        Vitest.expect(found.commit).toBe(expected);
        Vitest.expect(found.checkout).toBe(packageRoot);
      }),
    ),
  );

  Vitest.it.effect('does not write the git index while reading identity', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => writeManifest(sandbox.root, '@montflow/profiles', '0.0.1'));
        yield* Effect.promise(() => initRepo(sandbox.root, 'profile.md', '# profile\n'));
        yield* Effect.promise(() => writeFile(join(sandbox.root, 'profile.md'), '# edited\n'));
        const index = join(sandbox.root, '.git', 'index');
        const [beforeBytes, beforeStat] = yield* Effect.promise(() =>
          readFile(index).then(async (bytes) => [bytes, await stat(index)] as const),
        );

        yield* identity(sandbox.root);

        const [afterBytes, afterStat] = yield* Effect.promise(() =>
          readFile(index).then(async (bytes) => [bytes, await stat(index)] as const),
        );
        Vitest.expect(afterBytes.equals(beforeBytes)).toBe(true);
        Vitest.expect(afterStat.mtimeMs).toBe(beforeStat.mtimeMs);
      }),
    ),
  );
});
