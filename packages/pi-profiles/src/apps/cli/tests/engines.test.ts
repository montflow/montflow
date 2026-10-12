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

  Vitest.it.effect('verifies declared skills: missing and off-standard fail, generic passes', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-profiles-verify-' });
      const root = `${dir}/.agents/@montflow/profiles`;
      const skills = `${dir}/.agents/skills`;
      yield* fs.makeDirectory(`${root}/effect-reviewer`, { recursive: true });
      yield* fs.makeDirectory(`${skills}/effect`, { recursive: true });
      yield* fs.makeDirectory(`${skills}/montflow-bad`, { recursive: true });
      yield* fs.writeFileString(
        `${root}/effect-reviewer/PROFILE.md`,
        `---\nname: effect-reviewer\ndescription: Reviews Effect code.\nskills:\n  - effect\n  - montflow-bad\n  - missing-skill\n---\n\n# Effect Reviewer\n\n## Instructions\n\nReview.\n\n## Review Checklist\n\n- [ ] Done\n`,
      );
      yield* fs.writeFileString(`${skills}/effect/SKILL.md`, '# upstream shape, no frontmatter\n');
      yield* fs.writeFileString(`${skills}/montflow-bad/SKILL.md`, '# no frontmatter\n');

      const report = yield* Engines.verifyAll(dir).pipe(Effect.provide(TestLive));
      Vitest.expect(report.entries[0]?.result.valid).toBe(false);
      const messages =
        report.entries[0]?.result.issues.map((issue) => issue.message).join('\n') ?? '';
      Vitest.expect(messages).toContain("'missing-skill' is not installed under .agents/skills/.");
      Vitest.expect(messages).toContain("'montflow-bad' failed verification");
      Vitest.expect(messages).not.toContain("'effect'");
      Vitest.expect(report.warnings).toStrictEqual([]);
    }).pipe(Effect.provide(NodeLive), Effect.scoped),
  );

  Vitest.it.effect('verifies only the named profiles, reporting absent names', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-profiles-verify-' });
      const root = `${dir}/.agents/@montflow/profiles`;
      yield* fs.makeDirectory(`${root}/alpha`, { recursive: true });
      yield* fs.makeDirectory(`${root}/beta`, { recursive: true });
      yield* fs.writeFileString(`${root}/alpha/PROFILE.md`, validProfile('alpha'));
      yield* fs.writeFileString(`${root}/beta/PROFILE.md`, brokenProfile);

      const report = yield* Engines.verifyAll(dir, ['beta', 'missing']).pipe(
        Effect.provide(TestLive),
      );
      Vitest.expect(report.entries.map((entry) => entry.name)).toStrictEqual(['beta', 'missing']);
      Vitest.expect(report.entries[1]?.result.issues).toStrictEqual([
        { field: 'profile', message: 'Profile not found.' },
      ]);
      Vitest.expect(report.issueCount).toBeGreaterThan(0);
      Vitest.expect(report.entries.some((entry) => entry.name === 'alpha')).toBe(false);

      const named = yield* Engines.verifyAll(dir, ['alpha']).pipe(Effect.provide(TestLive));
      Vitest.expect(named.entries.map((entry) => entry.name)).toStrictEqual(['alpha']);
      Vitest.expect(named.issueCount).toBe(0);
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
