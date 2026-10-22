import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import { Skill as SkillSchema } from '@opencode/schema/skill';
import * as SkillPort from '../index.js';

const stored = (id: string): SkillSchema.Info =>
  SkillSchema.Info.make({
    id: SkillSchema.ID.make(id),
    name: SkillSchema.Name.make(id),
    // SAFETY: a host skill path is always absolute and the branded schema only
    // encodes that invariant; the fixture states it.
    path: `/repo/.agents/skills/${id}/SKILL.md` as SkillSchema.Info['path'],
    content: `---\nname: ${id}\ndescription: the ${id} skill\n---\n\nBody.\n`,
  });

interface Calls {
  readonly added: Array<string>;
  readonly removed: Array<string>;
}

const makeContext = (registered: Array<SkillSchema.Info> = []) => {
  const calls: Calls = { added: [], removed: [] };
  const context: SkillPort.SkillContext = {
    skill: {
      transform: (callback) =>
        Effect.sync(() => {
          callback({
            list: () => registered,
            get: (id) => registered.find((skill) => skill.id === id),
            add: (skill) => {
              calls.added.push(skill.id);
              registered.push(skill);
            },
            remove: (id) => {
              calls.removed.push(id);
              const index = registered.findIndex((skill) => skill.id === id);
              if (index !== -1) registered.splice(index, 1);
            },
          });
          return { dispose: Effect.void };
        }),
    },
  };
  return { context, calls };
};

Vitest.describe('SkillPort runtime', () => {
  Vitest.it('defineSkill builds a host skill from a store descriptor', () => {
    const skill = SkillPort.defineSkill({
      id: 'authoring-skills',
      name: 'authoring-skills',
      description: 'Write a skill',
      path: '/repo/.agents/skills/authoring-skills/SKILL.md',
      content: '# Skill',
      autoinvoke: true,
    });
    Vitest.expect(skill.id).toBe('authoring-skills');
    Vitest.expect(skill.name).toBe('authoring-skills');
    Vitest.expect(skill.description).toBe('Write a skill');
    Vitest.expect(skill.path).toBe('/repo/.agents/skills/authoring-skills/SKILL.md');
    Vitest.expect(skill.content).toBe('# Skill');
    Vitest.expect(skill.autoinvoke).toBe(true);
  });

  Vitest.it('defineSkill omits a missing description', () => {
    const skill = SkillPort.defineSkill({
      id: 'plain',
      name: 'plain',
      path: '/repo/.agents/skills/plain/SKILL.md',
      content: '# Skill',
    });
    Vitest.expect(skill.description).toBeUndefined();
    Vitest.expect(skill.autoinvoke).toBeUndefined();
  });

  Vitest.it.effect('add and remove drive the host skill registry', () =>
    Effect.gen(function* () {
      const { context, calls } = makeContext();
      const port = SkillPort.makeSkillPort(context);
      const skill = stored('authoring-skills');
      yield* port.add(skill).pipe(Effect.scoped);
      Vitest.expect(calls.added).toStrictEqual(['authoring-skills']);
      Vitest.expect(yield* port.list()).toStrictEqual([skill]);
      Vitest.expect(yield* port.get('authoring-skills')).toStrictEqual(skill);
      yield* port.remove('authoring-skills').pipe(Effect.scoped);
      Vitest.expect(calls.removed).toStrictEqual(['authoring-skills']);
      Vitest.expect(yield* port.list()).toStrictEqual([]);
    }),
  );

  Vitest.it.effect('fails at call time without a server context', () =>
    Effect.gen(function* () {
      const port = SkillPort.makeSkillPort({});
      const error = yield* port.list().pipe(
        Effect.catchDefect((defect) => Effect.fail(defect)),
        Effect.flip,
      );
      Vitest.expect(error).toBeInstanceOf(Error);
    }),
  );
});
