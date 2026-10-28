import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';

/**
 * The cross-package invariant: every one of the five `mf-*` binaries reports
 * the version its own `package.json` declares, through both `--version` and
 * `version --json`.
 *
 * This spawns the real binaries on purpose. A unit test over the shared
 * renderer cannot catch a package that was never wired to it, and that is the
 * exact drift this task exists to prevent.
 */

const REPO_ROOT = resolve(import.meta.dirname, '../../../../../..');
const CLI_PACKAGES = ['skills', 'specs', 'prompts', 'profiles', 'reviews'] as const;

interface Manifest {
  readonly name: string;
  readonly version: string;
}

const packageDir = (name: (typeof CLI_PACKAGES)[number]): string =>
  join(REPO_ROOT, 'packages', name);

const manifestOf = async (name: (typeof CLI_PACKAGES)[number]): Promise<Manifest> => {
  const text = await readFile(join(packageDir(name), 'package.json'), 'utf8');
  // SAFETY: every entry is a package.json this repository owns and the test
  // compares the decoded fields the binary reports; a malformed one fails the
  // assertions loudly rather than being trusted.
  return JSON.parse(text) as Manifest;
};

const run = (name: (typeof CLI_PACKAGES)[number], args: ReadonlyArray<string>) => {
  const main = join(packageDir(name), 'src/apps/cli/main.ts');
  const result = spawnSync('bun', ['run', main, ...args], {
    cwd: packageDir(name),
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

/** One throwaway workspace root. */
const withWorkspace = <A, E>(use: (root: string) => Effect.Effect<A, E>): Effect.Effect<A, E> =>
  Effect.acquireUseRelease(
    Effect.promise(() => mkdtemp(join(tmpdir(), 'mf-version-five-'))),
    use,
    (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
  );

Vitest.describe('version across all five CLIs runtime', () => {
  Vitest.it(
    'every binary reports the version in its own package.json',
    async () => {
      const reported = await Promise.all(
        CLI_PACKAGES.map(async (name) => {
          const manifest = await manifestOf(name);
          const json = run(name, ['version', '--json']);
          const flag = run(name, ['--version']);
          return { name, manifest, json, flag };
        }),
      );

      for (const { name, manifest, json, flag } of reported) {
        Vitest.expect(json.status, `${name} version --json`).toBe(0);
        Vitest.expect(json.stderr, `${name} stderr`).toBe('');
        const lines = json.stdout.trim().split('\n');
        Vitest.expect(lines, `${name} stdout is one JSON line`).toHaveLength(1);
        const identity: unknown = JSON.parse(lines[0] ?? '');
        Vitest.expect(identity).toMatchObject({
          name: manifest.name,
          version: manifest.version,
          source: 'package',
        });
        Vitest.expect(flag.status, `${name} --version`).toBe(0);
        Vitest.expect(flag.stdout.trim().endsWith(`v${manifest.version}`)).toBe(true);
      }
    },
    60_000,
  );

  Vitest.it.effect('version --dir reports an unmanaged store and then the manifest version', () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const store = join(root, '.agents', 'skills');
        yield* Effect.promise(() => mkdir(store, { recursive: true }));

        const unmanaged = run('skills', ['version', '--json', '--dir', root]);
        const unmanagedIdentity: unknown = JSON.parse(unmanaged.stdout.trim());
        Vitest.expect(unmanagedIdentity).toMatchObject({ store: { status: 'unmanaged' } });

        yield* Effect.promise(() =>
          writeFile(
            join(store, '.montflow-sync.json'),
            `${JSON.stringify({
              schemaVersion: 1,
              source: { path: '/checkout', version: '7.6.5', commit: 'd'.repeat(40) },
              syncedAt: '2026-10-28T00:00:00.000Z',
              skills: [],
            })}\n`,
          ),
        );

        const managed = run('skills', ['version', '--json', '--dir', root]);
        const managedIdentity: unknown = JSON.parse(managed.stdout.trim());
        Vitest.expect(managedIdentity).toMatchObject({
          store: { status: 'managed', version: '7.6.5', commit: 'd'.repeat(40) },
        });
      }),
    ),
  );
});

Vitest.describe('compiled binary runtime', () => {
  Vitest.it(
    'a compiled CLI still answers --version, version, and its own commands',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'mf-version-compiled-'));
      try {
        const manifest = await manifestOf('profiles');
        const artifact = join(root, 'mf-profiles');
        const build = spawnSync(
          'bun',
          [
            'build',
            join(packageDir('profiles'), 'src/apps/cli/main.ts'),
            '--compile',
            '--outfile',
            artifact,
          ],
          { cwd: packageDir('profiles'), encoding: 'utf8' },
        );
        Vitest.expect(build.status, build.stderr).toBe(0);

        const flag = spawnSync(artifact, ['--version'], { encoding: 'utf8' });
        Vitest.expect(flag.status).toBe(0);
        Vitest.expect(flag.stdout.trim().endsWith(`v${manifest.version}`)).toBe(true);

        const json = spawnSync(artifact, ['version', '--json', '--dir', root], {
          encoding: 'utf8',
        });
        Vitest.expect(json.status, json.stderr).toBe(0);
        const identity: unknown = JSON.parse(json.stdout.trim());
        Vitest.expect(identity).toMatchObject({
          name: manifest.name,
          version: manifest.version,
          source: 'generated',
        });
        Vitest.expect(identity).not.toHaveProperty('checkout');

        const list = spawnSync(artifact, ['list', '--dir', root], { encoding: 'utf8' });
        Vitest.expect(list.status, list.stderr).toBe(0);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
    120_000,
  );
});

Vitest.describe('Cli.run failure contract runtime', () => {
  Vitest.it(
    'prints a handler failure to stderr, keeps stdout empty, and exits 1',
    async () => {
      await mkdir(join(REPO_ROOT, 'packages/version/.tmp'), { recursive: true });
      const root = await mkdtemp(join(REPO_ROOT, 'packages/version/.tmp/failure-'));
      try {
        const script = join(root, 'failing.ts');
        const entry = join(REPO_ROOT, 'packages/version/src/index.ts');
        await writeFile(
          script,
          [
            "import { Effect } from 'effect';",
            "import { Command } from 'effect/unstable/cli';",
            `import { Cli } from '${entry}';`,
            "const command = Command.make('failing', {}, () => Effect.fail(new Error('boom')));",
            "Cli.run({ command, version: '1.2.3' });",
            '',
          ].join('\n'),
        );

        const result = spawnSync('bun', ['run', script], { cwd: REPO_ROOT, encoding: 'utf8' });

        Vitest.expect(result.status).toBe(1);
        Vitest.expect(result.stdout).toBe('');
        Vitest.expect(result.stderr).toContain('boom');
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
    60_000,
  );
});
