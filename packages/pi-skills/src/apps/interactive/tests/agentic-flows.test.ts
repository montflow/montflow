import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Interactive from '../index.js';
import * as Skill from '../../../modules/skill/index.js';

const scriptedUi = (answers: {
  readonly selects?: ReadonlyArray<string | undefined>;
  readonly inputs?: ReadonlyArray<string | undefined>;
  readonly notifies?: Array<string>;
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
    notify: (message) => {
      answers.notifies?.push(message);
    },
  };
};

const recordingLoading =
  (messages: Array<string>): Interactive.LoadingFn =>
  (message, self) => {
    messages.push(message);
    return self;
  };

const noInstaller: Interactive.SkillInstaller = () => Effect.fail('installer should not run');

const testSkillEffect = Skill.decodeUnknown({
  id: 'test-skill',
  name: 'test-skill',
  description: 'Does X',
  groups: [],
  dependencies: [],
  body: '',
});

const authoringSkillEffect = Skill.decodeUnknown({
  id: 'authoring-skills',
  name: 'authoring-skills',
  description: 'Guides skill creation.',
  groups: [],
  dependencies: [],
  body: 'Authoring body.',
});

const memoryStore = (installed: ReadonlyArray<Skill.Skill>): Interactive.SkillStore => ({
  list: () => Effect.succeed(installed),
  save: () => Effect.sync(() => {}),
  delete: () => Effect.fail('unused'),
  readRaw: () => Effect.fail('unused'),
});

Vitest.describe('Interactive.createAgentic with loading', () => {
  Vitest.it.effect('runs generation behind the session-model message', () =>
    Effect.gen(function* () {
      const skill = yield* testSkillEffect;
      const messages: Array<string> = [];
      const received: Array<Interactive.GenerateInput> = [];
      const ui = scriptedUi({
        selects: ['Continue with checked skills'],
        inputs: ['Does X'],
      });
      const result = yield* Interactive.createAgentic(
        ui,
        [],
        (input) => {
          received.push(input);
          return Effect.succeed(skill);
        },
        memoryStore([]),
        noInstaller,
        undefined,
        recordingLoading(messages),
      );
      Vitest.expect(result.id).toBe('test-skill');
      Vitest.expect(messages).toStrictEqual(['Generating skill with the session model…']);
      Vitest.expect(received).toStrictEqual([
        { description: 'Does X', modelLabel: undefined, inject: [] },
      ]);
    }),
  );

  Vitest.it.effect('injects checked requirement skills behind the picked-model message', () =>
    Effect.gen(function* () {
      const skill = yield* testSkillEffect;
      const authoring = yield* authoringSkillEffect;
      const messages: Array<string> = [];
      const received: Array<Interactive.GenerateInput> = [];
      const ui = scriptedUi({
        selects: ['Continue with checked skills'],
        inputs: ['Does X'],
      });
      const result = yield* Interactive.createAgentic(
        ui,
        [{ label: 'a/m', current: true }],
        (input) => {
          received.push(input);
          return Effect.succeed(skill);
        },
        memoryStore([authoring]),
        noInstaller,
        () => Promise.resolve('a/m'),
        recordingLoading(messages),
      );
      Vitest.expect(result.id).toBe('test-skill');
      Vitest.expect(messages).toStrictEqual(['Generating skill with a/m…']);
      Vitest.expect(received).toStrictEqual([
        { description: 'Does X', modelLabel: 'a/m', inject: [authoring] },
      ]);
    }),
  );
});

Vitest.describe('Interactive.createSkill menu', () => {
  Vitest.it.effect('offers the agentic path first', () =>
    Effect.gen(function* () {
      const options: Array<ReadonlyArray<string>> = [];
      const ui = scriptedUi({
        selects: ['Create manually'],
        inputs: ['manual-skill', 'Made by hand.'],
        options,
      });
      const result = yield* Interactive.createSkill(
        ui,
        [],
        () => Effect.fail('generator should not run'),
        memoryStore([]),
        noInstaller,
        undefined,
      );
      Vitest.expect(result.id).toBe('manual-skill');
      Vitest.expect(options[0]).toStrictEqual(['Create with agent', 'Create manually']);
    }),
  );
});

Vitest.describe('Interactive.run create completion', () => {
  Vitest.it.effect('announces the saved file and lands on the skill detail menu', () =>
    Effect.gen(function* () {
      const skill = yield* testSkillEffect;
      const authoring = yield* authoringSkillEffect;
      const messages: Array<string> = [];
      const notifies: Array<string> = [];
      const saved: Array<string> = [];
      const ui = scriptedUi({
        selects: ['Create with agent', 'Continue with checked skills', 'Back'],
        inputs: ['Does X'],
        notifies,
      });
      const store: Interactive.SkillStore = {
        list: () => Effect.succeed([authoring, skill]),
        save: (candidate) =>
          Effect.sync(() => {
            saved.push(candidate.id);
          }),
        delete: () => Effect.fail('unused'),
        readRaw: () => Effect.fail('unused'),
      };
      yield* Interactive.run(
        'create',
        {
          ui,
          cwd: '/tmp/skills-test',
          models: [],
          modelPicker: undefined,
          loading: recordingLoading(messages),
          installer: noInstaller,
          menu: undefined,
          transform: () => Effect.fail('unused'),
        },
        store,
        () => Effect.succeed(skill),
        () => Effect.fail('unused'),
      );
      Vitest.expect(saved).toStrictEqual(['test-skill']);
      Vitest.expect(messages).toStrictEqual(['Generating skill with the session model…']);
      Vitest.expect(notifies).toStrictEqual([
        "Saved skill 'test-skill' — .agents/skills/test-skill/SKILL.md",
      ]);
    }),
  );
});
