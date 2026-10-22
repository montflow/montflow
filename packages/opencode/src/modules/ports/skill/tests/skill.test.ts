import { Effect, Scope } from 'effect';
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

/**
 * A replaying skill registry: each read rebuilds the state from the registered
 * transforms over an empty base, exactly like the host `State`. A transform
 * that disposes itself therefore contributes nothing on the next read.
 */
const makeContext = () => {
  const transforms: Array<(editor: SkillPort.SkillEditor) => void> = [];
  let state: readonly SkillSchema.Info[] = [];
  let dirty = true;

  const reload = (): readonly SkillSchema.Info[] => {
    if (!dirty) return state;
    const next: SkillSchema.Info[] = [];
    const editor: SkillPort.SkillEditor = {
      list: () => next,
      get: (id) => next.find((skill) => skill.id === id),
      add: (skill) => {
        next.push(skill);
      },
      remove: (id) => {
        const index = next.findIndex((skill) => skill.id === id);
        if (index !== -1) next.splice(index, 1);
      },
    };
    for (const transform of transforms) transform(editor);
    state = next;
    dirty = false;
    return state;
  };

  const context: SkillPort.SkillContext = {
    skill: {
      transform: (callback) =>
        Effect.gen(function* () {
          const scope = yield* Scope.Scope;
          transforms.push(callback);
          dirty = true;
          // Host `State.transform` rebuilds synchronously after registering.
          reload();
          const dispose = Effect.sync(() => {
            const index = transforms.indexOf(callback);
            if (index !== -1) transforms.splice(index, 1);
            dirty = true;
          });
          yield* Scope.addFinalizer(scope, dispose);
          return { dispose };
        }),
    },
  };

  return {
    context,
    reload: Effect.sync(() => {
      dirty = true;
    }),
    visible: reload,
  };
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

  Vitest.it.effect('a registration outlives the add call and survives a reload', () =>
    Effect.gen(function* () {
      const { context, reload, visible } = makeContext();
      const port = SkillPort.makeSkillPort(context);
      const skill = stored('authoring-skills');
      yield* Effect.gen(function* () {
        yield* port.add(skill);
        yield* reload;
        Vitest.expect(visible()).toStrictEqual([skill]);
        Vitest.expect(yield* port.list()).toStrictEqual([skill]);
        Vitest.expect(yield* port.get('authoring-skills')).toStrictEqual(skill);
        yield* port.remove('authoring-skills');
        yield* reload;
        Vitest.expect(visible()).toStrictEqual([]);
      }).pipe(Effect.scoped);
      // The plugin scope closed, so every registration is gone with it.
      Vitest.expect(visible()).toStrictEqual([]);
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
