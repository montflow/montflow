import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as UpdateCheck from '../../update-check/index.js';
import * as Cli from '../index.js';

/**
 * The notice at the binary boundary: one stderr line when stale, silence when
 * current or unknown, and stdout/exit code untouched.
 *
 * The cache is seeded on disk before each spawn, so no test reaches the
 * network and the once-per-checkout suppression is exercised for real.
 */

const REPO_ROOT = resolve(import.meta.dirname, '../../../../../..');
const MAIN = join(REPO_ROOT, 'packages/skills/src/apps/cli/main.ts');
const KEY = UpdateCheck.cacheKey('@montflow/skills', REPO_ROOT);
const FAR_FUTURE = 4_102_444_800_000;

interface VerdictSeed {
  readonly verdict: UpdateCheck.Verdict;
  readonly notifiedAt?: number;
}

interface SeedEntry {
  readonly checkedAt: number;
  readonly expiresAt: number;
  readonly verdict: UpdateCheck.Verdict;
  notifiedAt?: number;
}

/** Write one cache entry for the repo checkout. */
const seedCache = async (home: string, seed: VerdictSeed): Promise<void> => {
  const dir = join(home, 'montflow');
  await mkdir(dir, { recursive: true });
  const entry: SeedEntry = {
    checkedAt: FAR_FUTURE - 1,
    expiresAt: FAR_FUTURE,
    verdict: seed.verdict,
  };
  if (seed.notifiedAt !== undefined) entry.notifiedAt = seed.notifiedAt;
  await writeFile(
    join(dir, 'version-check.json'),
    `${JSON.stringify({ schemaVersion: 1, entries: { [KEY]: entry } })}\n`,
  );
};

/** Run `mf-skills list` with the given cache home. */
const runList = (home: string, workspace: string, extra: ReadonlyArray<string> = []) =>
  spawnSync('bun', ['run', MAIN, 'list', '--dir', workspace, ...extra], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    // oxlint-disable-next-line montflow/no-process-env -- the spawned binary needs the runner's PATH; only the cache home is overridden.
    env: { ...process.env, XDG_CACHE_HOME: home },
  });

/** One throwaway cache home + workspace. */
const withSandbox = async <A>(
  use: (sandbox: { home: string; workspace: string }) => Promise<A>,
): Promise<A> => {
  const root = await mkdtemp(join(tmpdir(), 'mf-notice-'));
  const home = join(root, 'home');
  const workspace = join(root, 'workspace');
  await mkdir(home, { recursive: true });
  await mkdir(workspace, { recursive: true });
  try {
    return await use({ home, workspace });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

Vitest.describe('cli update notice runtime', () => {
  Vitest.it('prints one line when the cached verdict is behind', () =>
    withSandbox(async ({ home, workspace }) => {
      await seedCache(home, {
        verdict: { state: 'behind', available: '9.9.9', basis: 'tag' },
      });

      const stale = runList(home, workspace);

      Vitest.expect(stale.status).toBe(0);
      Vitest.expect(stale.stderr).toContain(`mf-skills 0.0.1 is behind 9.9.9 in ${REPO_ROOT}`);
      Vitest.expect(stale.stderr).toContain('guides/updating.md#mf-skills');
      Vitest.expect(stale.stderr.trim().split('\n')).toHaveLength(1);
    }),
  );

  Vitest.it('keeps stdout byte-identical and leaves the exit code alone', () =>
    withSandbox(async ({ home, workspace }) => {
      const currentHome = join(home, 'current');
      const staleHome = join(home, 'stale');
      await seedCache(currentHome, { verdict: { state: 'current' } });
      await seedCache(staleHome, {
        verdict: { state: 'behind', available: '9.9.9', basis: 'tag' },
      });

      const current = runList(currentHome, workspace);
      const stale = runList(staleHome, workspace);

      Vitest.expect(stale.stdout).toBe(current.stdout);
      Vitest.expect(stale.status).toBe(current.status);
      Vitest.expect(current.stderr).toBe('');
    }),
  );

  Vitest.it('stays silent when the verdict is unknown', () =>
    withSandbox(async ({ home, workspace }) => {
      await seedCache(home, { verdict: { state: 'unknown', reason: 'offline' } });

      const result = runList(home, workspace);

      Vitest.expect(result.stderr).toBe('');
      Vitest.expect(result.status).toBe(0);
    }),
  );

  Vitest.it('accepts --no-update-check and stays silent', () =>
    withSandbox(async ({ home, workspace }) => {
      await seedCache(home, {
        verdict: { state: 'behind', available: '9.9.9', basis: 'tag' },
      });

      const result = runList(home, workspace, ['--no-update-check']);

      Vitest.expect(result.status).toBe(0);
      Vitest.expect(result.stderr).toBe('');
    }),
  );

  Vitest.it('stays silent once the checkout has been notified', () =>
    withSandbox(async ({ home, workspace }) => {
      await seedCache(home, {
        verdict: { state: 'behind', available: '9.9.9', basis: 'tag' },
        notifiedAt: FAR_FUTURE - 1,
      });

      const result = runList(home, workspace);

      Vitest.expect(result.stderr).toBe('');
    }),
  );
});

Vitest.describe('UpdateCheck.shouldAnnounce runtime', () => {
  Vitest.it('skips identity, help, completion, and explicit opt-outs', () => {
    Vitest.expect(UpdateCheck.shouldAnnounce(['list'])).toBe(true);
    Vitest.expect(UpdateCheck.shouldAnnounce(['version'])).toBe(false);
    Vitest.expect(UpdateCheck.shouldAnnounce(['version', '--json'])).toBe(false);
    Vitest.expect(UpdateCheck.shouldAnnounce(['--version'])).toBe(false);
    Vitest.expect(UpdateCheck.shouldAnnounce(['--help'])).toBe(false);
    Vitest.expect(UpdateCheck.shouldAnnounce(['--completions=bash'])).toBe(false);
    Vitest.expect(UpdateCheck.shouldAnnounce(['list', '--no-update-check'])).toBe(false);
  });
});

Vitest.describe('Cli.checkLine runtime', () => {
  Vitest.it('renders each verdict and maps only behind to exit 1', () =>
    Effect.sync(() => {
      Vitest.expect(Cli.checkLine({ state: 'behind', available: '0.0.2', basis: 'tag' })).toBe(
        'behind 0.0.2',
      );
      Vitest.expect(Cli.checkLine({ state: 'current' })).toBe('current');
      Vitest.expect(Cli.checkLine({ state: 'ahead', available: '0.0.2' })).toBe('ahead of 0.0.2');
      Vitest.expect(Cli.checkLine({ state: 'unknown', reason: 'offline' })).toBe(
        'unknown: offline',
      );
      Vitest.expect(Cli.checkLine({ state: 'skipped', reason: 'ci' })).toBe('skipped: ci');
      Vitest.expect(Cli.checkExit({ state: 'behind', available: '0.0.2', basis: 'tag' })).toBe(1);
      Vitest.expect(Cli.checkExit({ state: 'current' })).toBe(0);
      Vitest.expect(Cli.checkExit({ state: 'unknown', reason: 'offline' })).toBe(0);
    }),
  );
});
