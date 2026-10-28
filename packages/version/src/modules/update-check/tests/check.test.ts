import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeServices } from '@effect/platform-node';
import { Duration, Effect, Fiber } from 'effect';
import { TestClock } from 'effect/testing';
import * as Vitest from '@effect/vitest';
import * as UpdateCheck from '../index.js';

/**
 * The check against a stubbed remote, never the network.
 *
 * `Probe` is the process boundary: every test supplies its own ref list or
 * failure, and cache assertions age the real JSON file on disk so the expiry
 * rule is proven rather than inferred.
 */

const MANIFEST = {
  packageName: '@montflow/skills',
  checkout: '/checkout',
  currentCommit: 'a'.repeat(40),
};

const tag = (version: string): UpdateCheck.RemoteRef => ({
  name: `refs/tags/@montflow/skills@${version}`,
  commit: 'b'.repeat(40),
});

const mainRef = (commit: string): UpdateCheck.RemoteRef => ({
  name: 'refs/heads/main',
  commit,
});

/** A probe that answers once per call and counts them. */
const fakeProbe = (answer: Effect.Effect<ReadonlyArray<UpdateCheck.RemoteRef>, string>) => {
  let calls = 0;
  const probe: UpdateCheck.Probe = {
    refs: () =>
      Effect.sync(() => {
        calls += 1;
      }).pipe(Effect.andThen(answer)),
  };
  return { probe, calls: () => calls };
};

/** One throwaway cache directory. */
const withCache = <A, E>(use: (dir: string) => Effect.Effect<A, E>): Effect.Effect<A, E> =>
  Effect.acquireUseRelease(
    Effect.promise(() => mkdtemp(join(tmpdir(), 'mf-update-check-'))),
    use,
    (dir) => Effect.promise(() => rm(dir, { recursive: true, force: true })),
  );

const run = (options: UpdateCheck.CheckOptions) =>
  UpdateCheck.check(options).pipe(Effect.provide(NodeServices.layer));

const cacheFile = (dir: string): string => join(dir, 'version-check.json');

/** The TTL stored for one package+checkout entry, read from the file on disk. */
const ttlOf = (file: string): Effect.Effect<number | undefined> =>
  Effect.promise(async () => {
    const parsed: unknown = JSON.parse(await readFile(file, 'utf8'));
    // SAFETY: the check writes this exact shape; a malformed cache yields an
    // undefined TTL and fails the assertion instead of being trusted.
    const cache = parsed as {
      entries: Record<string, { checkedAt: number; expiresAt: number }>;
    };
    const entry =
      cache.entries[
        UpdateCheck.cacheKey(
          MANIFEST.packageName,
          MANIFEST.checkout,
          '0.0.1',
          MANIFEST.currentCommit,
        )
      ];
    return entry === undefined ? undefined : entry.expiresAt - entry.checkedAt;
  });

Vitest.describe('UpdateCheck.compareSemVer runtime', () => {
  Vitest.it('orders releases and prereleases', () => {
    Vitest.expect(UpdateCheck.compareSemVer('1.2.3', '1.2.3')).toBe(0);
    Vitest.expect(UpdateCheck.compareSemVer('1.2.3', '1.2.4')).toBeLessThan(0);
    Vitest.expect(UpdateCheck.compareSemVer('2.0.0', '1.9.9')).toBeGreaterThan(0);
    Vitest.expect(UpdateCheck.compareSemVer('1.0.0-rc.1', '1.0.0')).toBeLessThan(0);
    Vitest.expect(UpdateCheck.compareSemVer('1.0.0-rc.2', '1.0.0-rc.1')).toBeGreaterThan(0);
  });
});

Vitest.describe('UpdateCheck.check runtime', () => {
  Vitest.it.effect('reports behind when the newest tag is newer', () =>
    withCache((dir) =>
      Effect.gen(function* () {
        const fake = fakeProbe(Effect.succeed([tag('0.0.2')]));
        const result = yield* run({
          ...MANIFEST,
          currentVersion: '0.0.1',
          cacheFile: cacheFile(dir),
          probe: fake.probe,
        });

        Vitest.expect(result).toStrictEqual({
          verdict: { state: 'behind', available: '0.0.2', basis: 'tag' },
          cached: false,
        });
        Vitest.expect(fake.calls()).toBe(1);
      }),
    ),
  );

  Vitest.it.effect('reports current when the newest tag matches', () =>
    withCache((dir) =>
      Effect.gen(function* () {
        const fake = fakeProbe(Effect.succeed([tag('0.0.1'), tag('0.0.0')]));
        const result = yield* run({
          ...MANIFEST,
          currentVersion: '0.0.1',
          cacheFile: cacheFile(dir),
          probe: fake.probe,
        });

        Vitest.expect(result.verdict).toStrictEqual({ state: 'current' });
      }),
    ),
  );

  Vitest.it.effect('reports ahead when the running version is newer than the newest tag', () =>
    withCache((dir) =>
      Effect.gen(function* () {
        const fake = fakeProbe(Effect.succeed([tag('0.0.2')]));
        const result = yield* run({
          ...MANIFEST,
          currentVersion: '0.0.3',
          cacheFile: cacheFile(dir),
          probe: fake.probe,
        });

        Vitest.expect(result.verdict).toStrictEqual({ state: 'ahead', available: '0.0.2' });
      }),
    ),
  );

  Vitest.it.effect('reports unknown when the probe fails', () =>
    withCache((dir) =>
      Effect.gen(function* () {
        const fake = fakeProbe(Effect.fail('dns failure'));
        const result = yield* run({
          ...MANIFEST,
          currentVersion: '0.0.1',
          cacheFile: cacheFile(dir),
          probe: fake.probe,
        });

        Vitest.expect(result.verdict).toStrictEqual({ state: 'unknown', reason: 'dns failure' });
      }),
    ),
  );

  Vitest.it.effect('falls back to the main commit when no tag matches', () =>
    withCache((dir) =>
      withRepo((repo) =>
        Effect.gen(function* () {
          const different = fakeProbe(Effect.succeed([mainRef(repo.second)]));
          const changed = yield* run({
            packageName: MANIFEST.packageName,
            checkout: repo.root,
            currentCommit: repo.first,
            currentVersion: '0.0.1',
            cacheFile: cacheFile(dir),
            probe: different.probe,
          });
          Vitest.expect(changed.verdict).toStrictEqual({
            state: 'behind',
            available: repo.second.slice(0, 7),
            basis: 'commit',
            commit: repo.second,
          });

          const same = fakeProbe(Effect.succeed([mainRef(repo.second)]));
          const current = yield* run({
            packageName: MANIFEST.packageName,
            checkout: repo.root,
            currentCommit: repo.second,
            currentVersion: '0.0.1',
            cacheFile: join(dir, 'second.json'),
            probe: same.probe,
          });
          Vitest.expect(current.verdict).toStrictEqual({ state: 'current' });
        }),
      ),
    ),
  );

  Vitest.it.effect('serves a second check from the cache without probing', () =>
    withCache((dir) =>
      Effect.gen(function* () {
        const fake = fakeProbe(Effect.succeed([tag('0.0.2')]));
        const options: UpdateCheck.CheckOptions = {
          ...MANIFEST,
          currentVersion: '0.0.1',
          cacheFile: cacheFile(dir),
          probe: fake.probe,
        };

        yield* run(options);
        const second = yield* run(options);

        Vitest.expect(second.cached).toBe(true);
        Vitest.expect(second.verdict).toStrictEqual({
          state: 'behind',
          available: '0.0.2',
          basis: 'tag',
        });
        Vitest.expect(fake.calls()).toBe(1);
      }),
    ),
  );

  Vitest.it.effect('honours a 24-hour success lifetime and a 1-hour failure lifetime', () =>
    withCache((dir) =>
      Effect.gen(function* () {
        const successFile = join(dir, 'success.json');
        const success = fakeProbe(Effect.succeed([tag('0.0.2')]));
        yield* run({
          ...MANIFEST,
          currentVersion: '0.0.1',
          cacheFile: successFile,
          probe: success.probe,
        });
        Vitest.expect(yield* ttlOf(successFile)).toBe(UpdateCheck.SUCCESS_TTL_MS);

        const failureFile = join(dir, 'failure.json');
        const failure = fakeProbe(Effect.fail('offline'));
        yield* run({
          ...MANIFEST,
          currentVersion: '0.0.1',
          cacheFile: failureFile,
          probe: failure.probe,
        });
        Vitest.expect(yield* ttlOf(failureFile)).toBe(UpdateCheck.FAILURE_TTL_MS);
      }),
    ),
  );

  Vitest.it.effect('re-probes once the on-disk cache entry has expired', () =>
    withCache((dir) =>
      Effect.gen(function* () {
        const fake = fakeProbe(Effect.succeed([tag('0.0.2')]));
        const file = cacheFile(dir);
        const options: UpdateCheck.CheckOptions = {
          ...MANIFEST,
          currentVersion: '0.0.1',
          cacheFile: file,
          probe: fake.probe,
        };
        yield* run(options);

        const parsed: unknown = JSON.parse(yield* Effect.promise(() => readFile(file, 'utf8')));
        // SAFETY: the check wrote this shape; the test deliberately ages it.
        const cache = parsed as {
          schemaVersion: number;
          entries: Record<string, { checkedAt: number; expiresAt: number }>;
        };
        const key = UpdateCheck.cacheKey(
          MANIFEST.packageName,
          MANIFEST.checkout,
          '0.0.1',
          MANIFEST.currentCommit,
        );
        const entry = cache.entries[key] ?? { checkedAt: 0, expiresAt: 0 };
        yield* Effect.promise(() =>
          writeFile(
            file,
            JSON.stringify({
              ...cache,
              entries: { [key]: { ...entry, checkedAt: 0, expiresAt: 0 } },
            }),
          ),
        );

        const second = yield* run(options);

        Vitest.expect(second.cached).toBe(false);
        Vitest.expect(fake.calls()).toBe(2);
      }),
    ),
  );

  Vitest.it.effect('force bypasses the cache', () =>
    withCache((dir) =>
      Effect.gen(function* () {
        const fake = fakeProbe(Effect.succeed([tag('0.0.2')]));
        const options: UpdateCheck.CheckOptions = {
          ...MANIFEST,
          currentVersion: '0.0.1',
          cacheFile: cacheFile(dir),
          probe: fake.probe,
        };
        yield* run(options);
        const forced = yield* run({ ...options, force: true });

        Vitest.expect(forced.cached).toBe(false);
        Vitest.expect(fake.calls()).toBe(2);
      }),
    ),
  );

  Vitest.it.effect('keys the cache by package and checkout', () =>
    withCache((dir) =>
      Effect.gen(function* () {
        const fake = fakeProbe(Effect.succeed([tag('0.0.2')]));
        yield* run({
          ...MANIFEST,
          currentVersion: '0.0.1',
          cacheFile: cacheFile(dir),
          probe: fake.probe,
        });
        yield* run({
          ...MANIFEST,
          checkout: '/other-checkout',
          currentVersion: '0.0.1',
          cacheFile: cacheFile(dir),
          probe: fake.probe,
        });

        Vitest.expect(fake.calls()).toBe(2);
      }),
    ),
  );

  Vitest.it.effect('skips without probing for every opt-out', () =>
    withCache((dir) =>
      Effect.gen(function* () {
        const fake = fakeProbe(Effect.succeed([tag('0.0.2')]));
        const base: UpdateCheck.CheckOptions = {
          ...MANIFEST,
          currentVersion: '0.0.1',
          cacheFile: cacheFile(dir),
          probe: fake.probe,
        };

        const env = yield* run({ ...base, env: { MONTFLOW_NO_UPDATE_CHECK: '1' } });
        const ci = yield* run({ ...base, env: { CI: 'true' } });
        const flag = yield* run({ ...base, args: ['version', '--no-update-check'] });

        Vitest.expect(env.verdict).toStrictEqual({ state: 'skipped', reason: 'env' });
        Vitest.expect(ci.verdict).toStrictEqual({ state: 'skipped', reason: 'ci' });
        Vitest.expect(flag.verdict).toStrictEqual({ state: 'skipped', reason: 'flag' });
        Vitest.expect(fake.calls()).toBe(0);
      }),
    ),
  );

  Vitest.it.effect('times out after two seconds and reports unknown', () =>
    withCache((dir) =>
      Effect.gen(function* () {
        const probe: UpdateCheck.Probe = { refs: () => Effect.never };
        const fiber = yield* Effect.forkChild(
          run({
            ...MANIFEST,
            currentVersion: '0.0.1',
            cacheFile: cacheFile(dir),
            probe,
          }),
        );
        yield* TestClock.adjust(Duration.seconds(2));
        const result = yield* Fiber.join(fiber);

        Vitest.expect(result.verdict).toStrictEqual({
          state: 'unknown',
          reason: `probe timed out after ${UpdateCheck.PROBE_TIMEOUT_MS}ms`,
        });
        Vitest.expect(yield* ttlOf(cacheFile(dir))).toBe(UpdateCheck.FAILURE_TTL_MS);
      }),
    ),
  );
});

/** Run git for a fixture and fail loudly when the fixture cannot be built. */
const git = (cwd: string, args: ReadonlyArray<string>): string => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
};

/** A real repository with two commits; both SHAs are exposed to the test. */
const withRepo = <A, E>(
  use: (repo: { root: string; first: string; second: string }) => Effect.Effect<A, E>,
): Effect.Effect<A, E> =>
  Effect.acquireUseRelease(
    Effect.promise(async () => {
      const root = await mkdtemp(join(tmpdir(), 'mf-update-repo-'));
      await writeFile(join(root, 'file.txt'), 'one\n');
      git(root, ['init', '-b', 'main']);
      git(root, ['add', '.']);
      git(root, ['-c', 'user.name=T', '-c', 'user.email=t@example.com', 'commit', '-m', 'one']);
      const first = git(root, ['rev-parse', 'HEAD']);
      await writeFile(join(root, 'file.txt'), 'two\n');
      git(root, ['add', '.']);
      git(root, ['-c', 'user.name=T', '-c', 'user.email=t@example.com', 'commit', '-m', 'two']);
      const second = git(root, ['rev-parse', 'HEAD']);
      return { root, first, second };
    }),
    use,
    (repo) => Effect.promise(() => rm(repo.root, { recursive: true, force: true })),
  );

Vitest.describe('UpdateCheck.defaultProbe runtime', () => {
  Vitest.it('reads tags and main from a local repository in one request', () =>
    Effect.gen(function* () {
      const repo = yield* Effect.promise(() =>
        mkdtemp(join(tmpdir(), 'mf-update-probe-')).then(async (root) => {
          await writeFile(join(root, 'file.txt'), 'one\n');
          git(root, ['init', '-b', 'main']);
          git(root, ['add', '.']);
          git(root, ['-c', 'user.name=T', '-c', 'user.email=t@example.com', 'commit', '-m', 'one']);
          git(root, ['tag', '@montflow/skills@0.0.2']);
          return root;
        }),
      );
      try {
        const refs = yield* UpdateCheck.defaultProbe
          .refs({ remote: repo, packageName: '@montflow/skills' })
          .pipe(Effect.provide(NodeServices.layer));

        Vitest.expect(refs.map((ref) => ref.name)).toContain('refs/tags/@montflow/skills@0.0.2');
        Vitest.expect(refs.map((ref) => ref.name)).toContain('refs/heads/main');
      } finally {
        yield* Effect.promise(() => rm(repo, { recursive: true, force: true }));
      }
    }),
  );

  Vitest.it('reports a non-zero git exit instead of an empty ref list', () =>
    Effect.gen(function* () {
      const reason = yield* UpdateCheck.defaultProbe
        .refs({
          remote: join(tmpdir(), 'does-not-exist-montflow'),
          packageName: '@montflow/skills',
        })
        .pipe(Effect.provide(NodeServices.layer), Effect.flip);

      Vitest.expect(reason).toContain('git ls-remote exited');
    }),
  );
});

Vitest.describe('UpdateCheck commit fallback runtime', () => {
  Vitest.it.effect('reports ahead when the local commit is not an ancestor of main', () =>
    withCache((dir) =>
      withRepo((repo) =>
        Effect.gen(function* () {
          const fake = fakeProbe(Effect.succeed([mainRef(repo.first)]));
          const result = yield* run({
            packageName: MANIFEST.packageName,
            checkout: repo.root,
            currentCommit: repo.second,
            currentVersion: '0.0.1',
            cacheFile: cacheFile(dir),
            probe: fake.probe,
          });

          Vitest.expect(result.verdict).toStrictEqual({
            state: 'ahead',
            available: repo.first.slice(0, 7),
          });
        }),
      ),
    ),
  );

  Vitest.it.effect('reports behind when the local commit is an ancestor of main', () =>
    withCache((dir) =>
      withRepo((repo) =>
        Effect.gen(function* () {
          const fake = fakeProbe(Effect.succeed([mainRef(repo.second)]));
          const result = yield* run({
            packageName: MANIFEST.packageName,
            checkout: repo.root,
            currentCommit: repo.first,
            currentVersion: '0.0.1',
            cacheFile: cacheFile(dir),
            probe: fake.probe,
          });

          Vitest.expect(result.verdict).toStrictEqual({
            state: 'behind',
            available: repo.second.slice(0, 7),
            basis: 'commit',
            commit: repo.second,
          });
        }),
      ),
    ),
  );
});

Vitest.describe('UpdateCheck cache hygiene runtime', () => {
  Vitest.it.effect('drops expired entries on write', () =>
    withCache((dir) =>
      Effect.gen(function* () {
        const file = cacheFile(dir);
        const key = UpdateCheck.cacheKey(
          MANIFEST.packageName,
          MANIFEST.checkout,
          '0.0.1',
          MANIFEST.currentCommit,
        );
        yield* Effect.promise(() =>
          writeFile(
            file,
            JSON.stringify({
              schemaVersion: 1,
              entries: {
                stale: { checkedAt: 0, expiresAt: 0, verdict: { state: 'current' } },
                [key]: { checkedAt: 0, expiresAt: 0, verdict: { state: 'current' } },
              },
            }),
          ),
        );
        const fake = fakeProbe(Effect.succeed([tag('0.0.2')]));
        yield* run({
          ...MANIFEST,
          currentVersion: '0.0.1',
          cacheFile: file,
          probe: fake.probe,
        });

        const parsed: unknown = JSON.parse(yield* Effect.promise(() => readFile(file, 'utf8')));
        // SAFETY: written by `check`; the assertion below checks the key set.
        const cache = parsed as { entries: Record<string, { checkedAt: number }> };
        Vitest.expect(Object.keys(cache.entries)).toStrictEqual([key]);
      }),
    ),
  );

  Vitest.it.effect('keeps the notice stamp across a forced refresh', () =>
    withCache((dir) =>
      Effect.gen(function* () {
        const fake = fakeProbe(Effect.succeed([tag('0.0.2')]));
        const options: UpdateCheck.CheckOptions = {
          ...MANIFEST,
          currentVersion: '0.0.1',
          cacheFile: cacheFile(dir),
          probe: fake.probe,
        };
        yield* run(options);
        const first = yield* UpdateCheck.claimNotice({
          packageName: MANIFEST.packageName,
          currentVersion: '0.0.1',
          checkout: MANIFEST.checkout,
          cacheFile: cacheFile(dir),
        }).pipe(Effect.provide(NodeServices.layer));
        yield* run({ ...options, force: true });
        const second = yield* UpdateCheck.claimNotice({
          packageName: MANIFEST.packageName,
          currentVersion: '0.0.1',
          checkout: MANIFEST.checkout,
          cacheFile: cacheFile(dir),
        }).pipe(Effect.provide(NodeServices.layer));

        Vitest.expect(first).toBe(true);
        Vitest.expect(second).toBe(false);
      }),
    ),
  );
});

Vitest.describe('UpdateCheck diverged and stale-remote runtime', () => {
  Vitest.it.effect('reports diverged when both sides moved', () =>
    withCache((dir) =>
      withRepo((repo) =>
        Effect.gen(function* () {
          git(repo.root, ['checkout', '-b', 'side', repo.first]);
          yield* Effect.promise(() => writeFile(join(repo.root, 'side.txt'), 'side\n'));
          git(repo.root, ['add', '.']);
          git(repo.root, [
            '-c',
            'user.name=T',
            '-c',
            'user.email=t@example.com',
            'commit',
            '-m',
            'side',
          ]);
          const side = git(repo.root, ['rev-parse', 'HEAD']);
          const fake = fakeProbe(Effect.succeed([mainRef(repo.second)]));
          const result = yield* run({
            packageName: MANIFEST.packageName,
            checkout: repo.root,
            currentCommit: side,
            currentVersion: '0.0.1',
            cacheFile: cacheFile(dir),
            probe: fake.probe,
          });

          Vitest.expect(result.verdict).toStrictEqual({
            state: 'diverged',
            available: repo.second.slice(0, 7),
          });
        }),
      ),
    ),
  );

  Vitest.it.effect('reports behind when the remote moved but its commit is not fetched', () =>
    withCache((dir) =>
      Effect.gen(function* () {
        const origin = yield* Effect.promise(() => mkdtemp(join(tmpdir(), 'mf-origin-')));
        const clone = yield* Effect.promise(() => mkdtemp(join(tmpdir(), 'mf-clone-')));
        try {
          yield* Effect.promise(async () => {
            await writeFile(join(origin, 'file.txt'), 'one\n');
            git(origin, ['init', '-b', 'main']);
            git(origin, ['add', '.']);
            git(origin, [
              '-c',
              'user.name=T',
              '-c',
              'user.email=t@example.com',
              'commit',
              '-m',
              'one',
            ]);
            await writeFile(join(origin, 'file.txt'), 'two\n');
            git(origin, ['add', '.']);
            git(origin, [
              '-c',
              'user.name=T',
              '-c',
              'user.email=t@example.com',
              'commit',
              '-m',
              'two',
            ]);
            git(clone, ['clone', origin, '.']);
          });
          const current = git(clone, ['rev-parse', 'HEAD']);
          yield* Effect.promise(async () => {
            await writeFile(join(origin, 'file.txt'), 'three\n');
            git(origin, ['add', '.']);
            git(origin, [
              '-c',
              'user.name=T',
              '-c',
              'user.email=t@example.com',
              'commit',
              '-m',
              'three',
            ]);
          });
          const remote = git(origin, ['rev-parse', 'HEAD']);
          const fake = fakeProbe(Effect.succeed([mainRef(remote)]));
          const result = yield* run({
            packageName: MANIFEST.packageName,
            checkout: clone,
            currentCommit: current,
            currentVersion: '0.0.1',
            cacheFile: cacheFile(dir),
            probe: fake.probe,
          });

          Vitest.expect(result.verdict).toStrictEqual({
            state: 'behind',
            available: remote.slice(0, 7),
            basis: 'commit',
            commit: remote,
          });
        } finally {
          yield* Effect.promise(() => rm(origin, { recursive: true, force: true }));
          yield* Effect.promise(() => rm(clone, { recursive: true, force: true }));
        }
      }),
    ),
  );
});
