import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import * as Vitest from '@effect/vitest';
import * as SkillCheck from '../index.js';

/** Platform layers for temp-directory setup. */
const NodeLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

/** Seed one skill under `<root>/.agents/skills/<name>/SKILL.md`. */
const seedSkill = (fs: FileSystem, root: string, name: string, markdown: string) =>
  Effect.gen(function* () {
    yield* fs.makeDirectory(`${root}/.agents/skills/${name}`, { recursive: true });
    yield* fs.writeFileString(`${root}/.agents/skills/${name}/SKILL.md`, markdown);
  });

Vitest.describe('SkillCheck.checkSkills', () => {
  Vitest.it.effect('passes a generic skill that only exists', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-skill-check-' });
      yield* seedSkill(fs, dir, 'effect', '# upstream shape, no montflow frontmatter\n');

      const check = yield* SkillCheck.checkSkills(dir, ['effect']);
      Vitest.expect(check.verdicts).toStrictEqual([{ name: 'effect', issue: undefined }]);
    }).pipe(Effect.provide(NodeLive), Effect.scoped),
  );

  Vitest.it.effect('flags a missing skill and an off-standard montflow skill', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-skill-check-' });
      yield* seedSkill(fs, dir, 'montflow-bad', '# no frontmatter\n');

      const check = yield* SkillCheck.checkSkills(dir, ['montflow-bad', 'effect', 'montflow-bad']);
      Vitest.expect(check.verdicts.map((verdict) => verdict.name)).toStrictEqual([
        'montflow-bad',
        'effect',
      ]);
      Vitest.expect(check.verdicts[0]?.issue?.message).toContain(
        "'montflow-bad' failed verification",
      );
      Vitest.expect(check.verdicts[1]?.issue?.message).toContain(
        "'effect' is not installed under .agents/skills/.",
      );
    }).pipe(Effect.provide(NodeLive), Effect.scoped),
  );

  Vitest.it.effect('short-circuits without loading the engine for no names', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-skill-check-' });
      const check = yield* SkillCheck.checkSkills(dir, []);
      Vitest.expect(check).toStrictEqual({ verdicts: [] });
    }).pipe(Effect.provide(NodeLive), Effect.scoped),
  );
});

Vitest.describe('SkillCheck.resolveSkills', () => {
  Vitest.it.effect('resolves the installed skill names under the store', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-skill-check-' });
      yield* seedSkill(fs, dir, 'effect', '# upstream shape\n');
      yield* seedSkill(fs, dir, 'montflow-bad', '# no frontmatter\n');

      const resolution = yield* SkillCheck.resolveSkills(dir);
      Vitest.expect(resolution?.root).toBe(dir);
      Vitest.expect([...(resolution?.names ?? [])].toSorted()).toStrictEqual([
        'effect',
        'montflow-bad',
      ]);
    }).pipe(Effect.provide(NodeLive), Effect.scoped),
  );

  Vitest.it.effect('returns undefined when no skills store exists', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-skill-check-' });
      const resolution = yield* SkillCheck.resolveSkills(dir);
      Vitest.expect(resolution).toBeUndefined();
    }).pipe(Effect.provide(NodeLive), Effect.scoped),
  );
});
