import { defineSkill, type Ports } from '@montflow/opencode';
import { Effect, type Scope } from 'effect';
import * as SkillStore from '../../modules/skill-store/index.js';

/**
 * Publish the workspace's `.agents/skills` store into the host skill
 * registry. The store stays the source of truth on disk; the host only
 * receives the id, name, description, path, and content it loads skills from,
 * so agents can select them like any native skill.
 */
export const syncSkills = (ports: Ports, cwd: string): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function* () {
    const skills = yield* SkillStore.list(cwd);
    yield* Effect.forEach(
      skills,
      (skill) =>
        SkillStore.readRaw(cwd, skill.id).pipe(
          Effect.map((content) =>
            defineSkill({
              id: skill.id,
              name: skill.name,
              description: skill.description,
              path: SkillStore.skillFilePath(cwd, skill.id),
              content,
            }),
          ),
          Effect.flatMap((definition) => ports.skill.add(definition)),
          // A skill the host refuses must not break the rest of the store.
          Effect.catchCause(() => Effect.void),
        ),
      { discard: true },
    );
  });
