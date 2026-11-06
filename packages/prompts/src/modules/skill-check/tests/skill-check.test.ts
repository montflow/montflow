import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import * as Vitest from '@effect/vitest';
import * as SkillCheck from '../index.js';

/** Platform layers for temp-directory setup. */
const NodeLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

Vitest.describe('SkillCheck.resolveSkills', () => {
  Vitest.it.effect('resolves the installed skill directories under the store', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-prompts-skill-check-' });
      yield* fs.makeDirectory(`${root}/.agents/skills/effect`, { recursive: true });
      yield* fs.writeFileString(`${root}/.agents/skills/effect/SKILL.md`, '# effect\n');
      yield* fs.makeDirectory(`${root}/.agents/skills/montflow-typescript-services`, {
        recursive: true,
      });
      yield* fs.writeFileString(
        `${root}/.agents/skills/montflow-typescript-services/SKILL.md`,
        '# services\n',
      );

      const resolution = yield* SkillCheck.resolveSkills(root);
      Vitest.expect(resolution?.root).toBe(root);
      Vitest.expect([...(resolution?.names ?? [])].toSorted()).toStrictEqual([
        'effect',
        'montflow-typescript-services',
      ]);
    }).pipe(Effect.provide(NodeLive), Effect.scoped),
  );

  Vitest.it.effect('does not count a directory without SKILL.md', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-prompts-skill-check-' });
      yield* fs.makeDirectory(`${root}/.agents/skills/empty`, { recursive: true });
      yield* fs.makeDirectory(`${root}/.agents/skills/effect`, { recursive: true });
      yield* fs.writeFileString(`${root}/.agents/skills/effect/SKILL.md`, '# effect\n');

      const resolution = yield* SkillCheck.resolveSkills(root);
      Vitest.expect([...(resolution?.names ?? [])]).toStrictEqual(['effect']);
    }).pipe(Effect.provide(NodeLive), Effect.scoped),
  );

  Vitest.it.effect('returns undefined when no skills store exists', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-prompts-skill-check-' });
      const resolution = yield* SkillCheck.resolveSkills(root);
      Vitest.expect(resolution).toBeUndefined();
    }).pipe(Effect.provide(NodeLive), Effect.scoped),
  );
});
