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
      yield* fs.makeDirectory(`${root}/.agents/skills/montflow-typescript-services`, {
        recursive: true,
      });

      const resolution = yield* SkillCheck.resolveSkills(root);
      Vitest.expect(resolution?.root).toBe(root);
      Vitest.expect([...(resolution?.names ?? [])].toSorted()).toStrictEqual([
        'effect',
        'montflow-typescript-services',
      ]);
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
