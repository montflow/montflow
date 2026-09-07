import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Interactive from '../index.js';
import * as Skill from '../../../modules/skill/index.js';

const scriptedUi = (answers: {
  readonly selects?: ReadonlyArray<string | undefined>;
  readonly inputs?: ReadonlyArray<string | undefined>;
  readonly options?: Array<ReadonlyArray<string>>;
}): Interactive.InteractiveUi => {
  let si = 0;
  let ii = 0;
  return {
    select: (_title, choices) => {
      answers.options?.push(choices);
      return Promise.resolve(answers.selects?.[si++]);
    },
    confirm: () => Promise.resolve(false),
    input: () => Promise.resolve(answers.inputs?.[ii++]),
    notify: () => {},
  };
};

const skillFixture = Effect.runSync(
  Skill.decodeUnknown({
    id: 'code-reviewer',
    name: 'code-reviewer',
    description: 'Reviews code.',
    groups: [],
    dependencies: [],
    body: '',
  }),
);

const skills = [skillFixture] as const;

const models: ReadonlyArray<Interactive.ModelOption> = [
  { label: 'a/m', current: true },
  { label: 'b/n', current: false },
];

const agenticModifier =
  (expectedId: string): Interactive.SkillModifier =>
  (input) =>
    Effect.succeed(
      Effect.runSync(
        Skill.decodeUnknown({
          ...Skill.encode(input.skill),
          description: `Updated ${expectedId}: ${input.instruction}`,
        }),
      ),
    );

const memoryStore = (installed: ReadonlyArray<Skill.Skill>): Interactive.SkillStore => ({
  list: () => Effect.succeed(installed),
  save: () => Effect.sync(() => {}),
  delete: () => Effect.fail('unused'),
  readRaw: () => Effect.fail('unused'),
});

const noInstaller: Interactive.SkillInstaller = () => Effect.fail('installer should not run');

Vitest.describe('Interactive.modifyManual', () => {
  Vitest.it.effect('edits the description of the named skill', () =>
    Effect.gen(function* () {
      const ui = scriptedUi({ inputs: ['Reviews code thoroughly.'] });
      const updated = yield* Interactive.modifyManual(ui, [...skills], 'code-reviewer');
      Vitest.expect(updated.description).toBe('Reviews code thoroughly.');
      Vitest.expect(updated.id).toBe('code-reviewer');
    }),
  );

  Vitest.it.effect('picks the skill when unnamed', () =>
    Effect.gen(function* () {
      const ui = scriptedUi({ selects: ['code-reviewer'], inputs: ['New description.'] });
      const updated = yield* Interactive.modifyManual(ui, [...skills], undefined);
      Vitest.expect(updated.description).toBe('New description.');
    }),
  );
});

Vitest.describe('Interactive.modifySkill', () => {
  Vitest.it.effect('offers the agentic path first', () =>
    Effect.gen(function* () {
      const options: Array<ReadonlyArray<string>> = [];
      const ui = scriptedUi({
        selects: ['Modify manually'],
        inputs: ['Manual edit.'],
        options,
      });
      const updated = yield* Interactive.modifySkill(
        ui,
        [...skills],
        'code-reviewer',
        models,
        agenticModifier('code-reviewer'),
        memoryStore([...skills]),
        noInstaller,
      );
      Vitest.expect(updated.description).toBe('Manual edit.');
      Vitest.expect(options[0]).toStrictEqual(['Modify with agent', 'Modify manually']);
    }),
  );

  Vitest.it.effect('dispatches to the manual flow', () =>
    Effect.gen(function* () {
      const ui = scriptedUi({
        selects: ['Modify manually'],
        inputs: ['Manual edit.'],
      });
      const updated = yield* Interactive.modifySkill(
        ui,
        [...skills],
        'code-reviewer',
        models,
        agenticModifier('code-reviewer'),
        memoryStore([...skills]),
        noInstaller,
      );
      Vitest.expect(updated.description).toBe('Manual edit.');
    }),
  );

  Vitest.it.effect('dispatches to the agentic flow with the picked model', () =>
    Effect.gen(function* () {
      const ui = scriptedUi({
        selects: ['Modify with agent', 'Continue with checked skills'],
        inputs: ['Add a security checklist.'],
      });
      const seen: Array<string | undefined> = [];
      const modelPicker = (
        options: ReadonlyArray<Interactive.ModelOption>,
      ): Promise<string | undefined> => {
        seen.push(options[0]?.label);
        return Promise.resolve('b/n');
      };
      const updated = yield* Interactive.modifySkill(
        ui,
        [...skills],
        'code-reviewer',
        models,
        (input) => {
          Vitest.expect(input.modelLabel).toBe('b/n');
          Vitest.expect(input.inject).toStrictEqual([]);
          return agenticModifier('code-reviewer')(input);
        },
        memoryStore([...skills]),
        noInstaller,
        modelPicker,
      );
      Vitest.expect(updated.description).toBe('Updated code-reviewer: Add a security checklist.');
      Vitest.expect(seen).toStrictEqual(['a/m']);
    }),
  );
});
