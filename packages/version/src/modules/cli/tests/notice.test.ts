import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
const TOPLEVEL = spawnSync('git', ['rev-parse', '--show-toplevel'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
}).stdout.trim();
const HEAD = spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
}).stdout.trim();
const VERSION: string = JSON.parse(
  spawnSync('cat', [`${REPO_ROOT}/packages/skills/package.json`], { encoding: 'utf8' }).stdout,
).version;
const KEY = UpdateCheck.cacheKey('@montflow/skills', TOPLEVEL, VERSION, HEAD);
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
const runCli = (home: string, args: ReadonlyArray<string>) =>
  spawnSync('bun', ['run', MAIN, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      // oxlint-disable-next-line montflow/no-process-env -- the spawned binary needs the runner's PATH; only the cache home is overridden.
      ...process.env,
      CI: undefined,
      MONTFLOW_NO_UPDATE_CHECK: undefined,
      XDG_CACHE_HOME: home,
    },
  });

const runList = (home: string, workspace: string, extra: ReadonlyArray<string> = []) =>
  runCli(home, ['list', '--dir', workspace, ...extra]);

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

  Vitest.it('stamps the cache and stays silent on the next run', () =>
    withSandbox(async ({ home, workspace }) => {
      await seedCache(home, {
        verdict: { state: 'behind', available: '9.9.9', basis: 'tag' },
      });

      const first = runList(home, workspace);
      const second = runList(home, workspace);

      Vitest.expect(first.stderr).toContain('is behind 9.9.9');
      Vitest.expect(second.stderr).toBe('');
      const parsed: unknown = JSON.parse(
        await readFile(join(home, 'montflow', 'version-check.json'), 'utf8'),
      );
      // SAFETY: the CLI wrote this file; the assertion below reads one field.
      const cache = parsed as { entries: Record<string, { notifiedAt?: number }> };
      Vitest.expect(cache.entries[KEY]?.notifiedAt).toBeTypeOf('number');
    }),
  );

  Vitest.it("keeps a failing command's exit code and still prints the notice", () =>
    withSandbox(async ({ home, workspace }) => {
      await seedCache(home, {
        verdict: { state: 'behind', available: '9.9.9', basis: 'tag' },
      });

      const result = runCli(home, ['show', 'missing', '--dir', workspace]);

      Vitest.expect(result.status).not.toBe(0);
      Vitest.expect(result.stderr).toContain('mf-skills 0.0.1 is behind 9.9.9');
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
    Vitest.expect(UpdateCheck.shouldAnnounce(['--log-level', 'debug', 'version', '--json'])).toBe(
      false,
    );
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

Vitest.describe('notice anchors runtime', () => {
  Vitest.it('every CLI anchor exists in guides/updating.md', () =>
    Effect.gen(function* () {
      const guide = yield* Effect.promise(() =>
        readFile(join(REPO_ROOT, 'guides/updating.md'), 'utf8'),
      );
      for (const cli of ['mf-skills', 'mf-specs', 'mf-prompts', 'mf-profiles', 'mf-reviews']) {
        Vitest.expect(guide, cli).toContain(`## ${cli}`);
      }
    }),
  );
});

Vitest.describe('version --check runtime', () => {
  Vitest.it(
    'exits 0 when current and 1 when the local remote has a newer tag',
    async () => {
      const repo = await mkdtemp(join(tmpdir(), 'mf-check-remote-'));
      const home = await mkdtemp(join(tmpdir(), 'mf-check-home-'));
      try {
        await writeFile(join(repo, 'file.txt'), 'one\n');
        const git = (args: ReadonlyArray<string>) => {
          const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
          if (result.status !== 0) throw new Error(result.stderr);
          return result.stdout.trim();
        };
        git(['init', '-b', 'main']);
        git(['add', '.']);
        git(['-c', 'user.name=T', '-c', 'user.email=t@example.com', 'commit', '-m', 'one']);
        git(['tag', '@montflow/skills@0.0.1']);

        const current = runCli(home, ['version', '--check', '--remote', repo]);
        Vitest.expect(current.status).toBe(0);
        Vitest.expect(current.stdout).toContain('current');

        git(['tag', '@montflow/skills@0.0.2']);
        const behind = runCli(home, ['version', '--check', '--remote', repo]);
        Vitest.expect(behind.status).toBe(1);
        Vitest.expect(behind.stdout).toContain('behind 0.0.2');
      } finally {
        await rm(repo, { recursive: true, force: true });
        await rm(home, { recursive: true, force: true });
      }
    },
    60_000,
  );
});

Vitest.describe('Cli.checkExit runtime', () => {
  Vitest.it('treats diverged as an available update and everything else as current', () => {
    Vitest.expect(Cli.checkExit({ state: 'diverged', available: 'abc1234' })).toBe(1);
    Vitest.expect(Cli.checkLine({ state: 'diverged', available: 'abc1234' })).toBe(
      'diverged from abc1234',
    );
  });
});
