import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import * as Vitest from '@effect/vitest';
import { ProfileStore } from '@montflow/profiles/services';
import { SpecStore } from '@montflow/specs/services';
import { ProfileProbe, ReviewStore } from '../../../services/index.js';
import * as Engines from '../engines.apps.module.js';

const NodeLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);
const StoreLive = Layer.provide(ReviewStore.Default, NodeLive);
const SpecProfileLive = Layer.mergeAll(
  Layer.provide(SpecStore.Default, NodeLive),
  Layer.provide(ProfileStore.Default, NodeLive),
);
const Live = Layer.mergeAll(StoreLive, ProfileProbe.Default, SpecProfileLive);

/** Stub probes for the declared-profile path. */
const probeFailed = Layer.mergeAll(
  StoreLive,
  SpecProfileLive,
  Layer.succeed(
    ProfileProbe.ProfileProbe,
    ProfileProbe.ProfileProbe.of({
      verify: () =>
        Effect.succeed<ProfileProbe.ProbeOutcome>({ kind: 'failed', message: '2 issues' }),
    }),
  ),
);
const probeUnavailable = Layer.mergeAll(
  StoreLive,
  SpecProfileLive,
  Layer.succeed(
    ProfileProbe.ProfileProbe,
    ProfileProbe.ProfileProbe.of({
      verify: () =>
        Effect.succeed<ProfileProbe.ProbeOutcome>({
          kind: 'unavailable',
          message: 'Profiles extension is not installed.',
        }),
    }),
  ),
);

/** A throwaway repo root. */
const freshRoot = (): Promise<string> => mkdtemp(join(tmpdir(), 'mf-reviews-cli-'));

/** Declare a `- Profile:` in a series ledger, bypassing the create flag. */
const declareProfile = async (root: string, name: string, profile: string): Promise<void> => {
  const ledger = join(root, '.agents', '@montflow', 'reviews', name, 'REVIEW.md');
  const raw = await readFile(ledger, 'utf8');
  await writeFile(ledger, raw.replace('- Rounds:', `- Profile: ${profile}\n- Rounds:`), 'utf8');
};

Vitest.describe('review CLI engines', () => {
  Vitest.it.effect('scaffolds a series, then lists and verifies it', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const created = yield* Engines.scaffold({ cwd: root, name: 'demo', target: 'the demo' });
      Vitest.expect(created.round).toBe('001');

      const series = yield* Engines.list({ cwd: root });
      Vitest.expect(series).toHaveLength(1);
      Vitest.expect(series[0]?.name).toBe('demo');
      Vitest.expect(series[0]?.status).toBe('open');
      Vitest.expect(series[0]?.open).toBe(0);
      Vitest.expect(series[0]?.rounds).toHaveLength(1);

      const report = yield* Engines.verifyAll({ cwd: root });
      Vitest.expect(report.issueCount).toBe(0);

      const ledger = yield* Engines.show({ cwd: root }, 'demo');
      Vitest.expect(ledger).toContain('# Review Series: demo');

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('adds the next round and keeps the ledger consistent', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Engines.scaffold({ cwd: root, name: 'demo' });
      const second = yield* Engines.scaffold({ cwd: root, name: 'demo' });
      Vitest.expect(second.round).toBe('002');

      const ledger = yield* Engines.show({ cwd: root }, 'demo');
      Vitest.expect(ledger).toContain('| 002 |');

      const report = yield* Engines.verifyAll({ cwd: root });
      Vitest.expect(report.issueCount).toBe(0);

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('refuses to overwrite an existing round', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Engines.scaffold({ cwd: root, name: 'demo', round: '001' });
      const failure = yield* Engines.scaffold({ cwd: root, name: 'demo', round: '001' }).pipe(
        Effect.flip,
      );
      Vitest.expect(failure).toContain('already exists');
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('stamps a scaffolded series with its profile and preserves it', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Engines.scaffold({
        cwd: root,
        name: 'demo-effect-reviewer',
        profile: 'effect-reviewer',
      });
      const ledger = yield* Engines.show({ cwd: root }, 'demo-effect-reviewer');
      Vitest.expect(ledger).toContain('- Profile: effect-reviewer');
      // A later scaffold without the flag must not clear the stamp.
      yield* Engines.scaffold({ cwd: root, name: 'demo-effect-reviewer' });
      const after = yield* Engines.show({ cwd: root }, 'demo-effect-reviewer');
      Vitest.expect(after).toContain('- Profile: effect-reviewer');
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('refuses to rebind a scaffolded series to a different profile', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Engines.scaffold({
        cwd: root,
        name: 'demo-effect-reviewer',
        profile: 'effect-reviewer',
      });
      const failure = yield* Engines.scaffold({
        cwd: root,
        name: 'demo-effect-reviewer',
        profile: 'generic-reviewer',
      }).pipe(Effect.flip);
      Vitest.expect(failure).toContain("already bound to profile 'effect-reviewer'");
      const ledger = yield* Engines.show({ cwd: root }, 'demo-effect-reviewer');
      Vitest.expect(ledger).toContain('- Profile: effect-reviewer');
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('verify reports a malformed round', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Engines.scaffold({ cwd: root, name: 'demo' });
      yield* Effect.promise(() =>
        writeFile(
          join(root, '.agents', '@montflow', 'reviews', 'demo', '001', 'REVIEW.md'),
          '# broken\n',
          'utf8',
        ),
      );
      const report = yield* Engines.verifySeries({ cwd: root }, 'demo');
      Vitest.expect(report.entries.some((entry) => !entry.result.valid)).toBe(true);
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('an empty store verifies clean', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const report = yield* Engines.verifyAll({ cwd: root });
      Vitest.expect(report.entries).toHaveLength(0);
      Vitest.expect(report.issueCount).toBe(0);
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('fails when a declared profile does not verify', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Engines.scaffold({ cwd: root, name: 'demo' });
      yield* Effect.promise(() => declareProfile(root, 'demo', 'effect-reviewer'));
      const report = yield* Engines.verifyAll({ cwd: root });
      Vitest.expect(report.issueCount).toBe(1);
      Vitest.expect(report.entries[0]?.result.issues[0]?.field).toBe('profile');
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(probeFailed)),
  );

  Vitest.it.effect('warns without failing when the profiles extension is unavailable', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Engines.scaffold({ cwd: root, name: 'demo' });
      yield* Effect.promise(() => declareProfile(root, 'demo', 'effect-reviewer'));
      const report = yield* Engines.verifyAll({ cwd: root });
      Vitest.expect(report.issueCount).toBe(0);
      Vitest.expect(report.warnings).toHaveLength(1);
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(probeUnavailable)),
  );

  Vitest.it.effect('resumes an existing series and refuses an absent one', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Engines.scaffold({ cwd: root, name: 'demo' });
      const resumed = yield* Engines.resume({ cwd: root }, 'demo');
      Vitest.expect(resumed.latestRound).toBe('001');
      Vitest.expect(resumed.latest).toContain('001/REVIEW.md');
      const missing = yield* Engines.resume({ cwd: root }, 'nope').pipe(Effect.flip);
      Vitest.expect(missing).toContain('No review series');
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );
});
