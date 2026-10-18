import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import * as Vitest from '@effect/vitest';
import * as Engines from '../engines.apps.module.js';
import * as Renderers from '../renderers.apps.module.js';
import * as SkillCheck from '../../../modules/skill-check/index.js';
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
      Vitest.expect(messages).toContain(
        `Skill 'missing-skill' is not installed under ${dir}/.agents/skills/.`,
      );
      Vitest.expect(messages).toContain("'montflow-bad' failed verification");
      Vitest.expect(messages).not.toContain("'effect'");
      Vitest.expect(report.warnings).toStrictEqual([]);
    }).pipe(Effect.provide(NodeLive), Effect.scoped),
  );

  Vitest.it.effect('counts warnings apart from issues in the whole-store summary', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-profiles-verify-' });
      const root = `${dir}/.agents/@montflow/profiles`;
      const skills = `${dir}/.agents/skills`;
      yield* fs.makeDirectory(`${root}/effect-reviewer`, { recursive: true });
      yield* fs.makeDirectory(`${skills}/effect`, { recursive: true });
      yield* fs.writeFileString(`${skills}/effect/SKILL.md`, '# upstream shape, no frontmatter\n');
      yield* fs.writeFileString(
        `${root}/effect-reviewer/PROFILE.md`,
        `---\nname: effect-reviewer\ndescription: Reviews Effect code.\nskills:\n  - effect\n  - missing-skill\n---\n\n# Effect Reviewer\n\n## Instructions\n\nReview.\n\n## Review Checklist\n\n- [ ] Done\n`,
      );

      const report = yield* Engines.verifyAll(dir).pipe(Effect.provide(TestLive));
      Vitest.expect(report.issueCount).toBe(0);
      Vitest.expect(report.warningCount).toBe(1);
      Vitest.expect(Engines.renderVerifyAll(report)).toContain(
        '1 profile \u00b7 0 issues \u00b7 1 warning',
      );
    }).pipe(Effect.provide(NodeLive), Effect.scoped),
  );

  Vitest.it.effect('verifies clean when no skills store exists, despite declared skills', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-profiles-verify-' });
      const root = `${dir}/.agents/@montflow/profiles`;
      yield* fs.makeDirectory(`${root}/effect-reviewer`, { recursive: true });
      yield* fs.writeFileString(
        `${root}/effect-reviewer/PROFILE.md`,
        `---\nname: effect-reviewer\ndescription: Reviews Effect code.\nskills:\n  - effect\n  - missing-skill\n---\n\n# Effect Reviewer\n\n## Instructions\n\nReview.\n\n## Review Checklist\n\n- [ ] Done\n`,
      );

      const report = yield* Engines.verifyAll(dir).pipe(Effect.provide(TestLive));
      Vitest.expect(report.entries[0]?.result.valid).toBe(true);
      Vitest.expect(report.issueCount).toBe(0);
      Vitest.expect(report.warnings).toStrictEqual([]);
    }).pipe(Effect.provide(NodeLive), Effect.scoped),
  );

  Vitest.it.effect('promotes unresolved skills to errors under strict', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-profiles-verify-' });
      const root = `${dir}/.agents/@montflow/profiles`;
      const skills = `${dir}/.agents/skills`;
      yield* fs.makeDirectory(`${root}/effect-reviewer`, { recursive: true });
      yield* fs.makeDirectory(`${skills}/effect`, { recursive: true });
      yield* fs.writeFileString(`${skills}/effect/SKILL.md`, '# upstream shape, no frontmatter\n');
      yield* fs.writeFileString(
        `${root}/effect-reviewer/PROFILE.md`,
        `---\nname: effect-reviewer\ndescription: Reviews Effect code.\nskills:\n  - effect\n  - missing-skill\n---\n\n# Effect Reviewer\n\n## Instructions\n\nReview.\n\n## Review Checklist\n\n- [ ] Done\n`,
      );

      const lenient = yield* Engines.verifyAll(dir).pipe(Effect.provide(TestLive));
      Vitest.expect(lenient.entries[0]?.result.valid).toBe(true);

      const strict = yield* Engines.verifyAll(dir, undefined, { strict: true }).pipe(
        Effect.provide(TestLive),
      );
      Vitest.expect(strict.entries[0]?.result.valid).toBe(false);
      Vitest.expect(
        strict.entries[0]?.result.issues.some((issue) => issue.severity === 'error'),
      ).toBe(true);
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

Vitest.describe('Engines.filterByStatus', () => {
  Vitest.it.effect('carries the warning count so a valid entry is not mistaken for clean', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-profiles-list-' });
      const root = `${dir}/.agents/@montflow/profiles`;
      const skills = `${dir}/.agents/skills`;
      yield* fs.makeDirectory(`${root}/effect-reviewer`, { recursive: true });
      yield* fs.makeDirectory(`${skills}/effect`, { recursive: true });
      yield* fs.writeFileString(`${skills}/effect/SKILL.md`, '# upstream shape, no frontmatter\n');
      yield* fs.writeFileString(
        `${root}/effect-reviewer/PROFILE.md`,
        `---\nname: effect-reviewer\ndescription: Reviews Effect code.\nskills:\n  - effect\n  - missing-skill\n---\n\n# Effect Reviewer\n\n## Instructions\n\nReview.\n\n## Review Checklist\n\n- [ ] Done\n`,
      );

      const profiles = yield* Engines.list(dir).pipe(Effect.provide(TestLive));
      const valid = yield* Engines.filterByStatus(dir, profiles, 'valid').pipe(
        Effect.provide(TestLive),
      );
      Vitest.expect(valid.map((entry) => entry.profile.name)).toStrictEqual(['effect-reviewer']);
      Vitest.expect(valid[0]?.warningCount).toBe(1);
      // The list surface must show the warning, not present the entry as clean.
      Vitest.expect(Renderers.list(valid)).toContain('effect-reviewer');
      Vitest.expect(Renderers.list(valid)).toContain('(1 warning)');
    }).pipe(Effect.provide(NodeLive), Effect.scoped),
  );
});

Vitest.describe('Engines.renderVerifyAll mixed verdict', () => {
  Vitest.it.effect('counts one error apart from one warning in the per-entry line', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-profiles-mixed-' });
      const root = `${dir}/.agents/@montflow/profiles`;
      const skills = `${dir}/.agents/skills`;
      yield* fs.makeDirectory(`${root}/broken`, { recursive: true });
      yield* fs.makeDirectory(`${skills}/effect`, { recursive: true });
      yield* fs.writeFileString(`${skills}/effect/SKILL.md`, '# upstream shape, no frontmatter\n');
      // Missing `## Review Checklist` (one error) plus an unresolved skill (one warning).
      yield* fs.writeFileString(
        `${root}/broken/PROFILE.md`,
        `---\nname: broken\ndescription: Missing the checklist.\nskills:\n  - effect\n  - missing-skill\n---\n\n# Broken\n\n## Instructions\n\nDo things.\n`,
      );

      const report = yield* Engines.verifyAll(dir).pipe(Effect.provide(TestLive));
      Vitest.expect(report.issueCount).toBe(1);
      Vitest.expect(report.warningCount).toBe(1);
      const text = Engines.renderVerifyAll(report);
      Vitest.expect(text).toContain('broken: ✗ not verified — 1 issue · 1 warning');
      Vitest.expect(text).not.toContain('broken: ✗ not verified — 2 issues');
    }).pipe(Effect.provide(NodeLive), Effect.scoped),
  );
});

Vitest.describe('Engines.skillsEngineWarning', () => {
  const resolution = { root: '/ws', names: new Set(['effect']) };

  Vitest.it('warns when the engine is unavailable and a skill was declared', () => {
    Vitest.expect(Engines.skillsEngineWarning(undefined, 1, false)).toBe(
      SkillCheck.SKILLS_ENGINE_WARNING,
    );
  });

  Vitest.it('stays silent when no store resolved but the engine is available', () => {
    Vitest.expect(Engines.skillsEngineWarning(undefined, 1, true)).toBeUndefined();
  });

  Vitest.it('stays silent when a resolution exists or nothing was declared', () => {
    Vitest.expect(Engines.skillsEngineWarning(resolution, 1, false)).toBeUndefined();
    Vitest.expect(Engines.skillsEngineWarning(undefined, 0, false)).toBeUndefined();
  });
});
