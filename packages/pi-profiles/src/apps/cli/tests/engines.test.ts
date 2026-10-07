import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import * as Vitest from '@effect/vitest';
import * as Engines from '../engines.apps.module.js';
import { ProfileStore } from '../../../services/index.js';

/** Platform layers plus the store, for headless engine tests. */
const NodeLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);
const TestLive = Layer.provide(ProfileStore.Default, NodeLive);

/** A `PROFILE.md` that passes mechanical verification. */
const validProfile = (name: string): string =>
  `---\nname: ${name}\ndescription: Does X.\n---\n\n# ${name}\n\n## Instructions\n\nDo X.\n\n## Review Checklist\n\n- [ ] Done\n`;

/** Not a profile file at all — the case `list` silently drops. */
const brokenProfile = '{ not a profile';

Vitest.describe('Engines.verifyAll', () => {
  Vitest.it.effect('reports a corrupt profile that list would drop', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-profiles-verify-' });
      const root = `${dir}/.agents/@montflow/profiles`;
      yield* fs.makeDirectory(`${root}/good`, { recursive: true });
      yield* fs.makeDirectory(`${root}/broken`, { recursive: true });
      yield* fs.writeFileString(`${root}/good/PROFILE.md`, validProfile('good'));
      yield* fs.writeFileString(`${root}/broken/PROFILE.md`, brokenProfile);

      const report = yield* Engines.verifyAll(dir).pipe(Effect.provide(TestLive));
      Vitest.expect(report.entries.map((entry) => entry.name)).toStrictEqual(['broken', 'good']);
      Vitest.expect(
        report.entries.filter((entry) => !entry.result.valid).map((entry) => entry.name),
      ).toStrictEqual(['broken']);

      const text = Engines.renderVerifyAll(report);
      Vitest.expect(text).toContain('broken:');
      Vitest.expect(text).not.toContain('good:');
      Vitest.expect(text).toContain('2 profiles');
    }).pipe(Effect.provide(NodeLive), Effect.scoped),
  );

  Vitest.it.effect('prints a passing profile only under verbose', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-profiles-verify-' });
      const root = `${dir}/.agents/@montflow/profiles`;
      yield* fs.makeDirectory(`${root}/good`, { recursive: true });
      yield* fs.writeFileString(`${root}/good/PROFILE.md`, validProfile('good'));

      const report = yield* Engines.verifyAll(dir).pipe(Effect.provide(TestLive));
      Vitest.expect(report.issueCount).toBe(0);
      Vitest.expect(Engines.renderVerifyAll(report)).not.toContain('good:');
      Vitest.expect(Engines.renderVerifyAll(report, true)).toContain('good:');
    }).pipe(Effect.provide(NodeLive), Effect.scoped),
  );

  Vitest.it.effect('flags an invalid-slug profile directory instead of dropping it', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-profiles-verify-' });
      const root = `${dir}/.agents/@montflow/profiles`;
      yield* fs.makeDirectory(`${root}/Bad Name`, { recursive: true });
      yield* fs.writeFileString(`${root}/Bad Name/PROFILE.md`, validProfile('Bad Name'));

      const report = yield* Engines.verifyAll(dir).pipe(Effect.provide(TestLive));
      Vitest.expect(report.entries.map((entry) => entry.name)).toStrictEqual(['Bad Name']);
      Vitest.expect(report.entries[0]?.result.valid).toBe(false);
      Vitest.expect(report.issueCount).toBeGreaterThan(0);
    }).pipe(Effect.provide(NodeLive), Effect.scoped),
  );

  Vitest.it.effect('fails when the store directory is missing', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-profiles-verify-' });
      const error = yield* Engines.verifyAll(dir).pipe(Effect.provide(TestLive), Effect.flip);
      Vitest.expect(error).toContain('not found');
    }).pipe(Effect.provide(NodeLive), Effect.scoped),
  );
});
