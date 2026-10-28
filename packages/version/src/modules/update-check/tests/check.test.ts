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
    const entry = cache.entries[UpdateCheck.cacheKey(MANIFEST.packageName, MANIFEST.checkout)];
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
      Effect.gen(function* () {
        const different = fakeProbe(Effect.succeed([mainRef('c'.repeat(40))]));
        const changed = yield* run({
          ...MANIFEST,
          currentVersion: '0.0.1',
          cacheFile: cacheFile(dir),
          probe: different.probe,
        });
        Vitest.expect(changed.verdict).toStrictEqual({
          state: 'behind',
          available: 'c'.repeat(7),
          basis: 'commit',
          commit: 'c'.repeat(40),
        });

        const same = fakeProbe(Effect.succeed([mainRef(MANIFEST.currentCommit)]));
        const current = yield* run({
          ...MANIFEST,
          currentVersion: '0.0.1',
          cacheFile: join(dir, 'second.json'),
          probe: same.probe,
        });
        Vitest.expect(current.verdict).toStrictEqual({ state: 'current' });
      }),
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
        const key = UpdateCheck.cacheKey(MANIFEST.packageName, MANIFEST.checkout);
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
