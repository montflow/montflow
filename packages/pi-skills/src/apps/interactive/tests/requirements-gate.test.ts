import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Interactive from '../index.js';
import * as Skill from '../../../modules/skill/index.js';

const scriptedUi = (answers: {
  readonly selects?: ReadonlyArray<string | undefined>;
  readonly notifies?: Array<string>;
  readonly options?: Array<ReadonlyArray<string>>;
}): Interactive.InteractiveUi => {
  let si = 0;
  return {
    select: (_title, choices) => {
      answers.options?.push(choices);
      return Promise.resolve(answers.selects?.[si++]);
    },
    confirm: () => Promise.resolve(false),
    input: () => Promise.resolve(undefined),
    notify: (message) => {
      answers.notifies?.push(message);
    },
  };
};

const skillInput = (id: string, dependencies: ReadonlyArray<string> = []) => ({
  id,
  name: id,
  description: `${id} description.`,
  groups: [],
  dependencies: [...dependencies],
  body: `${id} body.`,
});

const required = ['authoring-skills'];

Vitest.describe('Interactive.ensureRequirements', () => {
  Vitest.it.effect('returns installed skills with dependencies first', () =>
    Effect.gen(function* () {
      const authoring = yield* Skill.decodeUnknown(
        skillInput('authoring-skills', ['executing-skills']),
      );
      const executing = yield* Skill.decodeUnknown(skillInput('executing-skills'));
      const ui = scriptedUi({ selects: ['Continue with checked skills'] });
      const store: Interactive.SkillStore = {
        list: () => Effect.succeed([authoring, executing]),
        save: () => Effect.sync(() => {}),
        delete: () => Effect.fail('unused'),
        readRaw: () => Effect.fail('unused'),
      };
      const injected = yield* Interactive.ensureRequirements(
        ui,
        store,
        () => Effect.fail('installer should not run'),
        required,
        'agentic skill creation',
      );
      Vitest.expect(injected.map((skill) => skill.id)).toStrictEqual([
        'executing-skills',
        'authoring-skills',
      ]);
    }),
  );

  Vitest.it.effect('unchecking skips injection', () =>
    Effect.gen(function* () {
      const authoring = yield* Skill.decodeUnknown(skillInput('authoring-skills'));
      const ui = scriptedUi({
        selects: ['✓ authoring-skills — installed, will inject', 'Continue with checked skills'],
      });
      const store: Interactive.SkillStore = {
        list: () => Effect.succeed([authoring]),
        save: () => Effect.sync(() => {}),
        delete: () => Effect.fail('unused'),
        readRaw: () => Effect.fail('unused'),
      };
      const injected = yield* Interactive.ensureRequirements(
        ui,
        store,
        () => Effect.fail('installer should not run'),
        required,
        'agentic skill creation',
      );
      Vitest.expect(injected).toStrictEqual([]);
    }),
  );

  Vitest.it.effect('installs missing skills before continuing', () =>
    Effect.gen(function* () {
      const authoring = yield* Skill.decodeUnknown(skillInput('authoring-skills'));
      const installed: Array<Skill.Skill> = [];
      const installedNames: Array<ReadonlyArray<string>> = [];
      const notifies: Array<string> = [];
      const ui = scriptedUi({
        selects: ['Install missing skills', 'Continue with checked skills'],
        notifies,
      });
      const store: Interactive.SkillStore = {
        list: () => Effect.succeed([...installed]),
        save: () => Effect.sync(() => {}),
        delete: () => Effect.fail('unused'),
        readRaw: () => Effect.fail('unused'),
      };
      const injected = yield* Interactive.ensureRequirements(
        ui,
        store,
        (names) =>
          Effect.sync(() => {
            installedNames.push(names);
            installed.push(authoring);
          }),
        required,
        'agentic skill creation',
      );
      Vitest.expect(installedNames).toStrictEqual([['authoring-skills']]);
      Vitest.expect(injected.map((skill) => skill.id)).toStrictEqual(['authoring-skills']);
      Vitest.expect(notifies).toStrictEqual(['Installed authoring-skills.']);
    }),
  );

  Vitest.it.effect('picking a missing skill hints at install, then continues without it', () =>
    Effect.gen(function* () {
      const notifies: Array<string> = [];
      const ui = scriptedUi({
        selects: ['✗ authoring-skills — not installed', 'Continue with checked skills'],
        notifies,
      });
      const store: Interactive.SkillStore = {
        list: () => Effect.succeed([]),
        save: () => Effect.sync(() => {}),
        delete: () => Effect.fail('unused'),
        readRaw: () => Effect.fail('unused'),
      };
      const injected = yield* Interactive.ensureRequirements(
        ui,
        store,
        () => Effect.fail('installer should not run'),
        required,
        'agentic skill creation',
      );
      Vitest.expect(injected).toStrictEqual([]);
      Vitest.expect(notifies).toStrictEqual([
        "'authoring-skills' is not installed — install missing skills first.",
      ]);
    }),
  );

  Vitest.it.effect('lists continue first so one keystroke keeps going', () =>
    Effect.gen(function* () {
      const options: Array<ReadonlyArray<string>> = [];
      const ui = scriptedUi({
        selects: ['Continue with checked skills'],
        options,
      });
      const store: Interactive.SkillStore = {
        list: () => Effect.succeed([]),
        save: () => Effect.sync(() => {}),
        delete: () => Effect.fail('unused'),
        readRaw: () => Effect.fail('unused'),
      };
      yield* Interactive.ensureRequirements(
        ui,
        store,
        () => Effect.fail('installer should not run'),
        required,
        'agentic skill creation',
      );
      Vitest.expect(options).toStrictEqual([
        [
          'Continue with checked skills',
          '✗ authoring-skills — not installed',
          'Install missing skills',
        ],
      ]);
    }),
  );

  Vitest.it.effect('fails with cancellation when the dialog is dismissed', () =>
    Effect.gen(function* () {
      const ui = scriptedUi({ selects: [undefined] });
      const store: Interactive.SkillStore = {
        list: () => Effect.succeed([]),
        save: () => Effect.sync(() => {}),
        delete: () => Effect.fail('unused'),
        readRaw: () => Effect.fail('unused'),
      };
      const error = yield* Effect.flip(
        Interactive.ensureRequirements(
          ui,
          store,
          () => Effect.fail('installer should not run'),
          required,
          'agentic skill creation',
        ),
      );
      Vitest.expect(error).toBe('Cancelled.');
    }),
  );
});
