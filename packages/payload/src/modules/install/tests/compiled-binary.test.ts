import { spawnSync } from 'node:child_process';
import * as Fs from 'node:fs';
import * as Os from 'node:os';
import * as NodePath from 'node:path';
import * as Vitest from '@effect/vitest';

/**
 * The compiled binary must keep a working doctor: `bun build --compile` does
 * not expose the package directory, so the embedded payload and the statically
 * imported manifest are the only sources at runtime.
 *
 * Every package that has a manifest is covered. There is no `mf-sessions`
 * package at HEAD and this test does not invent one.
 */

const REPO_ROOT = NodePath.resolve(import.meta.dirname, '..', '..', '..', '..', '..', '..');

const PACKAGES = [
  'skills',
  'prompts',
  'specs',
  'profiles',
  'reviews',
  'references',
  'model-fallback',
] as const;

/** Run a command and return its status and combined output. */
const spawn = (command: string, args: ReadonlyArray<string>, cwd: string, hermetic = true) => {
  const result = spawnSync(command, [...args], {
    cwd,
    encoding: 'utf8',
    // Only the compiled artifact — invoked by absolute path — runs hermetically.
    // The build step needs a PATH that actually contains `bun`
    // (~/.bun/bin on ubuntu-latest CI, /usr/bin on the dev host).
    // oxlint-disable-next-line montflow/no-process-env -- the build step inherits the runner PATH so `bun` resolves; only the hermetic artifact run overrides it.
    env: hermetic ? { PATH: '/usr/bin:/bin', HOME: '/tmp/opencode', CI: 'true' } : process.env,
  });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
};

Vitest.describe('compiled binary doctor', () => {
  Vitest.it(
    'every package with a manifest installs and re-checks its payload from the embed',
    () => {
      for (const pkg of PACKAGES) {
        const packageDir = NodePath.join(REPO_ROOT, 'packages', pkg);
        const artifact = NodePath.join(
          Fs.mkdtempSync(NodePath.join(Os.tmpdir(), `mf-${pkg}-compiled-`)),
          `mf-${pkg}`,
        );
        // The build step inherits the parent PATH so `bun` resolves; the
        // compiled artifact runs hermetically below.
        const build = spawn(
          'bun',
          ['build', 'src/apps/cli/main.ts', '--compile', '--outfile', artifact],
          packageDir,
          false,
        );
        Vitest.expect(build.status, `${pkg} build: ${build.output}`).toBe(0);

        const root = Fs.mkdtempSync(NodePath.join(Os.tmpdir(), `mf-${pkg}-doctor-`));
        try {
          const repair = spawn(artifact, ['doctor', '--dir', root], root);
          Vitest.expect(repair.status, `${pkg} repair: ${repair.output}`).toBe(0);
          Vitest.expect(repair.output).not.toContain('not usable');

          const check = spawn(artifact, ['doctor', '--check', '--dir', root], root);
          Vitest.expect(check.status, `${pkg} check: ${check.output}`).toBe(0);
          Vitest.expect(check.output).not.toContain('not usable');
        } finally {
          Fs.rmSync(root, { recursive: true, force: true });
          Fs.rmSync(NodePath.dirname(artifact), { recursive: true, force: true });
        }
      }
    },
    180_000,
  );
});
