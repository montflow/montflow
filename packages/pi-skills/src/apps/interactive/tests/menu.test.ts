import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Interactive from '../index.js';
import * as Skill from '../../../modules/skill/index.js';

const scriptedUi = (answers: {
  readonly selects?: ReadonlyArray<string | undefined>;
  readonly titles?: Array<string>;
  readonly options?: Array<ReadonlyArray<string>>;
}): Interactive.InteractiveUi => {
  let si = 0;
  return {
    select: (title, choices) => {
      answers.titles?.push(title);
      answers.options?.push(choices);
      return Promise.resolve(answers.selects?.[si++]);
    },
    confirm: () => Promise.resolve(false),
    input: () => Promise.resolve(undefined),
    notify: () => {},
  };
};

const skillInput = (id: string) => ({
  id,
  name: id,
  description: `${id} description.`,
  groups: [],
  dependencies: [],
  body: `${id} body.`,
});

const envFor = (
  ui: Interactive.InteractiveUi,
  installer: Interactive.SkillInstaller,
  menu?: Interactive.MenuFn | undefined,
): Interactive.CommandEnv => ({
  ui,
  cwd: '/tmp/skills-test',
  models: [],
  modelPicker: undefined,
  loading: undefined,
  installer,
  menu,
  transform: () => Effect.fail('unused'),
});

Vitest.describe('Interactive.run menu status', () => {
  Vitest.it.effect('annotates installed dependencies without an install entry', () =>
    Effect.gen(function* () {
      const authoring = yield* Skill.decodeUnknown(skillInput('authoring-skills'));
      const modifying = yield* Skill.decodeUnknown(skillInput('modifying-skills'));
      const titles: Array<string> = [];
      const options: Array<ReadonlyArray<string>> = [];
      const ui = scriptedUi({ selects: ['Exit'], titles, options });
      const store: Interactive.SkillStore = {
        list: () => Effect.succeed([authoring, modifying]),
        save: () => Effect.sync(() => {}),
        delete: () => Effect.fail('unused'),
        readRaw: () => Effect.fail('unused'),
      };
      yield* Interactive.run(
        '',
        envFor(ui, () => Effect.fail('installer should not run')),
        store,
        () => Effect.fail('unused'),
        () => Effect.fail('unused'),
      );
      Vitest.expect(titles).toStrictEqual(['Skills']);
      Vitest.expect(options).toStrictEqual([['Browse skills', 'Create skill', 'Exit']]);
    }),
  );

  Vitest.it.effect('offers install when missing, then reopens annotated clean', () =>
    Effect.gen(function* () {
      const authoring = yield* Skill.decodeUnknown(skillInput('authoring-skills'));
      const modifying = yield* Skill.decodeUnknown(skillInput('modifying-skills'));
      const installed: Array<Skill.Skill> = [authoring];
      const installedNames: Array<ReadonlyArray<string>> = [];
      const titles: Array<string> = [];
      const options: Array<ReadonlyArray<string>> = [];
      const ui = scriptedUi({
        selects: [
          'Install required skills',
          'Install missing skills',
          'Continue with checked skills',
          'Exit',
        ],
        titles,
        options,
      });
      const store: Interactive.SkillStore = {
        list: () => Effect.succeed([...installed]),
        save: () => Effect.sync(() => {}),
        delete: () => Effect.fail('unused'),
        readRaw: () => Effect.fail('unused'),
      };
      yield* Interactive.run(
        '',
        envFor(ui, (names) =>
          Effect.sync(() => {
            installedNames.push(names);
            installed.push(modifying);
          }),
        ),
        store,
        () => Effect.fail('unused'),
        () => Effect.fail('unused'),
      );
      Vitest.expect(installedNames).toStrictEqual([['modifying-skills']]);
      Vitest.expect(titles[0]).toBe('Skills');
      Vitest.expect(options[0]).toStrictEqual([
        'Browse skills',
        'Create skill',
        'Install required skills',
        'Exit',
      ]);
      Vitest.expect(titles.at(-1)).toBe('Skills');
      Vitest.expect(options.at(-1)).toStrictEqual(['Browse skills', 'Create skill', 'Exit']);
    }),
  );

  Vitest.it.effect('renders the TUI menu with the info panel when injected', () =>
    Effect.gen(function* () {
      const authoring = yield* Skill.decodeUnknown(skillInput('authoring-skills'));
      const seen: Array<{
        readonly title: string;
        readonly info: ReadonlyArray<string>;
        readonly options: ReadonlyArray<string>;
      }> = [];
      const ui = scriptedUi({});
      const store: Interactive.SkillStore = {
        list: () => Effect.succeed([authoring]),
        save: () => Effect.sync(() => {}),
        delete: () => Effect.fail('unused'),
        readRaw: () => Effect.fail('unused'),
      };
      const menu: Interactive.MenuFn = (title, info, options) => {
        seen.push({ title, info, options });
        return Effect.succeed('Exit');
      };
      yield* Interactive.run(
        '',
        envFor(ui, () => Effect.fail('installer should not run'), menu),
        store,
        () => Effect.fail('unused'),
        () => Effect.fail('unused'),
      );
      Vitest.expect(seen).toStrictEqual([
        {
          title: 'Skills',
          info: ['✗ dependencies missing'],
          options: ['Browse skills', 'Create skill', 'Install required skills', 'Exit'],
        },
      ]);
    }),
  );

  Vitest.it.effect('renders a generic installed line in the info panel', () =>
    Effect.gen(function* () {
      const authoring = yield* Skill.decodeUnknown(skillInput('authoring-skills'));
      const modifying = yield* Skill.decodeUnknown(skillInput('modifying-skills'));
      const seen: Array<{
        readonly title: string;
        readonly info: ReadonlyArray<string>;
        readonly options: ReadonlyArray<string>;
      }> = [];
      const ui = scriptedUi({});
      const store: Interactive.SkillStore = {
        list: () => Effect.succeed([authoring, modifying]),
        save: () => Effect.sync(() => {}),
        delete: () => Effect.fail('unused'),
        readRaw: () => Effect.fail('unused'),
      };
      const menu: Interactive.MenuFn = (title, info, options) => {
        seen.push({ title, info, options });
        return Effect.succeed('Exit');
      };
      yield* Interactive.run(
        '',
        envFor(ui, () => Effect.fail('installer should not run'), menu),
        store,
        () => Effect.fail('unused'),
        () => Effect.fail('unused'),
      );
      Vitest.expect(seen).toStrictEqual([
        {
          title: 'Skills',
          info: ['✓ dependencies installed'],
          options: ['Browse skills', 'Create skill', 'Exit'],
        },
      ]);
    }),
  );
});
