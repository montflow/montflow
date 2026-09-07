import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Interactive from '../index.js';
import * as PiProfiles from '../../../modules/pi-profiles/index.js';

const scriptedUi = (answers: {
  readonly selects?: ReadonlyArray<string | undefined>;
  readonly inputs?: ReadonlyArray<string | undefined>;
  readonly notifies?: Array<string>;
  readonly titles?: Array<string>;
  readonly options?: Array<ReadonlyArray<string>>;
}): Interactive.InteractiveUi => {
  let si = 0;
  let ii = 0;
  return {
    select: (title, choices) => {
      answers.titles?.push(title);
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

const noSkills: Interactive.SkillStore = {
  list: () => Effect.succeed([]),
};

const testProfileEffect = PiProfiles.decodeUnknown({
  name: 'code-reviewer',
  description: 'Reviews code',
  model: '',
  skills: [],
  instructions: 'Be strict.',
  checklist: ['Flag issues'],
});

const authoringProfiles: Interactive.InstalledSkill = {
  id: 'authoring-profiles',
  name: 'authoring-profiles',
  description: 'Guides profile authoring.',
  dependencies: [],
  body: 'Authoring body.',
};

const modifyingProfiles: Interactive.InstalledSkill = {
  id: 'modifying-profiles',
  name: 'modifying-profiles',
  description: 'Guides profile modification.',
  dependencies: [],
  body: 'Modifying body.',
};

Vitest.describe('Interactive.parseAction', () => {
  Vitest.it('opens the menu on empty args and shows on a bare name', () => {
    Vitest.expect(Interactive.parseAction('')).toStrictEqual({ kind: 'Menu' });
    Vitest.expect(Interactive.parseAction('code-reviewer')).toStrictEqual({
      kind: 'Show',
      name: 'code-reviewer',
    });
    Vitest.expect(Interactive.parseAction('create')).toStrictEqual({
      kind: 'Create',
      name: undefined,
    });
    Vitest.expect(Interactive.parseAction('help')).toStrictEqual({ kind: 'Help' });
  });
});

Vitest.describe('Interactive.createAgentic with loading', () => {
  Vitest.it.effect('runs generation behind the session-model message', () =>
    Effect.gen(function* () {
      const profile = yield* testProfileEffect;
      const messages: Array<string> = [];
      const received: Array<Interactive.GenerateInput> = [];
      const ui = scriptedUi({
        selects: ['Continue with checked skills'],
        inputs: ['Reviews code'],
      });
      const result = yield* Interactive.createAgentic(
        ui,
        [],
        (input) => {
          received.push(input);
          return Effect.succeed(profile);
        },
        noSkills,
        noInstaller,
        undefined,
        recordingLoading(messages),
      );
      Vitest.expect(result.name).toBe('code-reviewer');
      Vitest.expect(messages).toStrictEqual(['Generating profile with the session model…']);
      Vitest.expect(received).toStrictEqual([
        { description: 'Reviews code', modelLabel: undefined, inject: [] },
      ]);
    }),
  );

  Vitest.it.effect('injects authoring-profiles behind the picked-model message', () =>
    Effect.gen(function* () {
      const profile = yield* testProfileEffect;
      const messages: Array<string> = [];
      const received: Array<Interactive.GenerateInput> = [];
      const ui = scriptedUi({
        selects: ['Continue with checked skills'],
        inputs: ['Reviews code'],
      });
      const withAuthoring: Interactive.SkillStore = {
        list: () => Effect.succeed([authoringProfiles]),
      };
      const result = yield* Interactive.createAgentic(
        ui,
        [{ label: 'a/m', current: true }],
        (input) => {
          received.push(input);
          return Effect.succeed(profile);
        },
        withAuthoring,
        noInstaller,
        () => Promise.resolve('a/m'),
        recordingLoading(messages),
      );
      Vitest.expect(result.name).toBe('code-reviewer');
      Vitest.expect(messages).toStrictEqual(['Generating profile with a/m…']);
      Vitest.expect(received).toStrictEqual([
        { description: 'Reviews code', modelLabel: 'a/m', inject: [authoringProfiles] },
      ]);
    }),
  );
});

Vitest.describe('Interactive.ensureRequirements install', () => {
  Vitest.it.effect('installs authoring-profiles then continues with it checked', () =>
    Effect.gen(function* () {
      const installed: Array<Interactive.InstalledSkill> = [];
      const installedNames: Array<ReadonlyArray<string>> = [];
      const notifies: Array<string> = [];
      const ui = scriptedUi({
        selects: ['Install missing skills', 'Continue with checked skills'],
        notifies,
      });
      const store: Interactive.SkillStore = {
        list: () => Effect.succeed([...installed]),
      };
      const result = yield* Interactive.ensureRequirements(
        ui,
        store,
        (names) =>
          Effect.sync(() => {
            installedNames.push(names);
            installed.push(authoringProfiles);
          }),
        PiProfiles.GENERATION_REQUIREMENTS,
        'agentic profile creation',
      );
      Vitest.expect(installedNames).toStrictEqual([['authoring-profiles']]);
      Vitest.expect(result).toStrictEqual([authoringProfiles]);
      Vitest.expect(notifies).toStrictEqual(['Installed authoring-profiles.']);
    }),
  );
});

Vitest.describe('Interactive.createProfile menu', () => {
  Vitest.it.effect('offers the agentic path first', () =>
    Effect.gen(function* () {
      const options: Array<ReadonlyArray<string>> = [];
      const ui = scriptedUi({
        selects: ['Create manually'],
        inputs: ['manual-profile', 'Made by hand.'],
        options,
      });
      const result = yield* Interactive.createProfile(
        ui,
        [],
        () => Effect.fail('generator should not run'),
        noSkills,
        noInstaller,
        undefined,
      );
      Vitest.expect(result.name).toBe('manual-profile');
      Vitest.expect(options[0]).toStrictEqual(['Create with agent', 'Create manually']);
    }),
  );
});

Vitest.describe('Interactive.run menu status', () => {
  Vitest.it.effect('offers install when missing, then reopens annotated clean', () =>
    Effect.gen(function* () {
      const installed: Array<Interactive.InstalledSkill> = [];
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
      const skills: Interactive.SkillStore = {
        list: () => Effect.succeed([...installed]),
      };
      const profiles: Interactive.ProfileStore = {
        list: () => Effect.succeed([]),
        save: () => Effect.fail('unused'),
        delete: () => Effect.fail('unused'),
      };
      yield* Interactive.run(
        '',
        {
          ui,
          cwd: '/tmp/profiles-test',
          models: [],
          modelPicker: undefined,
          loading: undefined,
          installer: (names) =>
            Effect.sync(() => {
              installedNames.push(names);
              installed.push(authoringProfiles, modifyingProfiles);
            }),
          menu: undefined,
        },
        profiles,
        skills,
        () => Effect.fail('unused'),
        () => Effect.fail('unused'),
      );
      Vitest.expect(installedNames).toStrictEqual([
        ['authoring-profiles', 'modifying-profiles'],
      ]);
      Vitest.expect(titles[0]).toBe('Profiles');
      Vitest.expect(options[0]).toStrictEqual([
        'Browse profiles',
        'Create profile',
        'Install required skills',
        'Exit',
      ]);
      Vitest.expect(titles.at(-1)).toBe('Profiles');
      Vitest.expect(options.at(-1)).toStrictEqual(['Browse profiles', 'Create profile', 'Exit']);
    }),
  );
});

Vitest.describe('Interactive.run create completion', () => {
  Vitest.it.effect('announces the saved file and lands on the profile detail menu', () =>
    Effect.gen(function* () {
      const profile = yield* testProfileEffect;
      const messages: Array<string> = [];
      const notifies: Array<string> = [];
      const saved: Array<string> = [];
      const ui = scriptedUi({
        selects: ['Create with agent', 'Continue with checked skills', 'Back'],
        inputs: ['Reviews code'],
        notifies,
      });
      const store: Interactive.ProfileStore = {
        list: () => Effect.succeed([profile]),
        save: (candidate) =>
          Effect.sync(() => {
            saved.push(candidate.name);
          }),
        delete: () => Effect.fail('unused'),
      };
      yield* Interactive.run(
        'create',
        {
          ui,
          cwd: '/tmp/profiles-test',
          models: [],
          modelPicker: undefined,
          loading: recordingLoading(messages),
          installer: noInstaller,
          menu: undefined,
        },
        store,
        noSkills,
        () => Effect.succeed(profile),
        () => Effect.fail('unused'),
      );
      Vitest.expect(saved).toStrictEqual(['code-reviewer']);
      Vitest.expect(messages).toStrictEqual(['Generating profile with the session model…']);
      Vitest.expect(notifies).toStrictEqual([
        "Saved profile 'code-reviewer' — .agents/@montflow/pi-profiles/code-reviewer/PROFILE.md",
        '✓ verified',
      ]);
    }),
  );
});

Vitest.describe('Interactive.browse empty list', () => {
  Vitest.it.effect('offers create-first instead of failing', () =>
    Effect.gen(function* () {
      const titles: Array<string> = [];
      const options: Array<ReadonlyArray<string>> = [];
      const ui: Interactive.InteractiveUi = {
        select: (title, choices) => {
          titles.push(title);
          options.push(choices);
          return Promise.resolve('← Back');
        },
        confirm: () => Promise.resolve(false),
        input: () => Promise.resolve(undefined),
        notify: () => {},
      };
      const store: Interactive.ProfileStore = {
        list: () => Effect.succeed([]),
        save: () => Effect.fail('save should not run'),
        delete: () => Effect.fail('unused'),
      };
      yield* Interactive.browse(
        ui,
        store,
        [],
        () => Effect.fail('generator should not run'),
        () => Effect.fail('unused'),
        noSkills,
        noInstaller,
      );
      Vitest.expect(titles).toStrictEqual(['No profiles yet']);
      Vitest.expect(options).toStrictEqual([['Create profile', '← Back']]);
    }),
  );

  Vitest.it.effect('creates inline then returns to the now-populated browse', () =>
    Effect.gen(function* () {
      const saved: Array<PiProfiles.Profile> = [];
      const notifies: Array<string> = [];
      const ui = scriptedUi({
        selects: ['Create profile', 'Create manually', 'Back'],
        inputs: ['fresh-profile', 'Fresh profile.'],
        notifies,
      });
      const store: Interactive.ProfileStore = {
        list: () => Effect.succeed([...saved]),
        save: (candidate) =>
          Effect.sync(() => {
            saved.push(candidate);
          }),
        delete: () => Effect.fail('unused'),
      };
      yield* Interactive.browse(
        ui,
        store,
        [],
        () => Effect.fail('generator should not run'),
        () => Effect.fail('unused'),
        noSkills,
        noInstaller,
      );
      Vitest.expect(saved.map((profile) => profile.name)).toStrictEqual(['fresh-profile']);
      Vitest.expect(notifies).toStrictEqual(["Saved profile 'fresh-profile'."]);
    }),
  );
});
