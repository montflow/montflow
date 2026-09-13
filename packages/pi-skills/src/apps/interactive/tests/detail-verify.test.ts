import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Interactive from '../index.js';
import * as Skill from '../../../modules/skill/index.js';

const validRaw = `---
name: test-skill
description: Does X when Y shows up. Use when testing skills.
id: a1b2c3d4e5f6a7b8
author: Tester
version: 1.0.0
---

# When To Use

Use when testing.

# Pipeline

Do the thing.

# Reference

Nothing.
`;

const invalidRaw = `---
name: test-skill
description: Does X.
---

Some body without the expected sections.
`;

const scriptedUi = (answers: {
  readonly selects?: ReadonlyArray<string | undefined>;
  readonly notifies?: Array<string>;
}): Interactive.InteractiveUi => {
  let si = 0;
  return {
    select: (_title, _choices) => Promise.resolve(answers.selects?.[si++]),
    confirm: () => Promise.resolve(false),
    input: () => Promise.resolve(undefined),
    notify: (message) => {
      answers.notifies?.push(message);
    },
  };
};

const testSkill = Skill.decodeUnknown({
  id: 'test-skill',
  name: 'test-skill',
  description: 'Does X.',
  groups: [],
  dependencies: [],
  body: 'Some body.',
}).pipe(Effect.runSync);

const memoryStore = (raw: string, saved: Array<string>): Interactive.SkillStore => ({
  list: () => Effect.succeed([testSkill]),
  save: (candidate) =>
    Effect.sync(() => {
      saved.push(candidate.id);
    }),
  delete: () => Effect.fail('unused'),
  readRaw: () => Effect.succeed(raw),
});

const menuQueue = (
  seen: Array<{
    readonly title: string;
    readonly info: ReadonlyArray<string>;
    readonly options: ReadonlyArray<string>;
  }>,
  answers: ReadonlyArray<string | undefined>,
): Interactive.MenuFn => {
  let mi = 0;
  return (title, info, options) => {
    seen.push({ title, info, options });
    return Effect.succeed(answers[mi++]);
  };
};

const envFor = (
  ui: Interactive.InteractiveUi,
  menu: Interactive.MenuFn,
): Interactive.CommandEnv => ({
  ui,
  cwd: '/tmp/skills-test',
  models: [],
  modelPicker: undefined,
  loading: undefined,
  installer: () => Effect.fail('installer should not run'),
  menu,
  transform: () => Effect.fail('unused'),
});

Vitest.describe('Interactive.detailOptions', () => {
  Vitest.it('hides the transform entry while verified', () => {
    Vitest.expect(Interactive.detailOptions({ valid: true, issues: [] })).toStrictEqual([
      'Show',
      'Modify',
      'Re-verify',
      'Delete',
      'Back',
    ]);
  });

  Vitest.it('shows the transform entry near the bottom while unverified', () => {
    Vitest.expect(
      Interactive.detailOptions({
        valid: false,
        issues: [{ field: 'id', message: 'Missing.' }],
      }),
    ).toStrictEqual(['Show', 'Modify', 'Re-verify', 'Delete', 'Transform to standard', 'Back']);
  });
});

Vitest.describe('Interactive.detail verify panel', () => {
  Vitest.it.effect('shows the cross panel and transform entry for an unverified skill', () =>
    Effect.gen(function* () {
      const seen: Array<{
        readonly title: string;
        readonly info: ReadonlyArray<string>;
        readonly options: ReadonlyArray<string>;
      }> = [];
      const ui = scriptedUi({ selects: ['test-skill', 'Back'] });
      yield* Interactive.run(
        'browse',
        envFor(ui, menuQueue(seen, ['Back'])),
        memoryStore(invalidRaw, []),
        () => Effect.fail('unused'),
        () => Effect.fail('unused'),
      );
      Vitest.expect(seen).toStrictEqual([
        {
          title: "Skill 'test-skill'",
          info: ['✗ not verified — 6 issues'],
          options: ['Show', 'Modify', 'Re-verify', 'Delete', 'Transform to standard', 'Back'],
        },
      ]);
    }),
  );

  Vitest.it.effect('shows the check panel without transform for a verified skill', () =>
    Effect.gen(function* () {
      const seen: Array<{
        readonly title: string;
        readonly info: ReadonlyArray<string>;
        readonly options: ReadonlyArray<string>;
      }> = [];
      const ui = scriptedUi({ selects: ['test-skill', 'Back'] });
      yield* Interactive.run(
        'browse',
        envFor(ui, menuQueue(seen, ['Back'])),
        memoryStore(validRaw, []),
        () => Effect.fail('unused'),
        () => Effect.fail('unused'),
      );
      Vitest.expect(seen).toStrictEqual([
        {
          title: "Skill 'test-skill'",
          info: ['✓ verified'],
          options: ['Show', 'Modify', 'Re-verify', 'Delete', 'Back'],
        },
      ]);
    }),
  );

  Vitest.it.effect('re-verify notifies the issue list and returns to the menu', () =>
    Effect.gen(function* () {
      const notifies: Array<string> = [];
      const seen: Array<{
        readonly title: string;
        readonly info: ReadonlyArray<string>;
        readonly options: ReadonlyArray<string>;
      }> = [];
      const ui = scriptedUi({ selects: ['test-skill', 'Back'], notifies });
      yield* Interactive.run(
        'browse',
        envFor(ui, menuQueue(seen, ['Re-verify', 'Back'])),
        memoryStore(invalidRaw, []),
        () => Effect.fail('unused'),
        () => Effect.fail('unused'),
      );
      Vitest.expect(seen.length).toBe(2);
      Vitest.expect(notifies.length).toBe(1);
      Vitest.expect(notifies[0]).toContain("✗ 'test-skill' has 6 issues:");
      Vitest.expect(notifies[0]).toContain('[id]');
    }),
  );

  Vitest.it.effect('transform runs the fixer with the fixed instruction and saves', () =>
    Effect.gen(function* () {
      const notifies: Array<string> = [];
      const saved: Array<string> = [];
      const received: Array<Interactive.ModifyInput> = [];
      const seen: Array<{
        readonly title: string;
        readonly info: ReadonlyArray<string>;
        readonly options: ReadonlyArray<string>;
      }> = [];
      const ui = scriptedUi({
        selects: ['test-skill', 'Continue with checked skills', 'Back'],
        notifies,
      });
      const env: Interactive.CommandEnv = {
        ...envFor(ui, menuQueue(seen, ['Transform to standard', 'Back'])),
        transform: (input) => {
          received.push(input);
          return Effect.succeed(input.skill);
        },
      };
      yield* Interactive.run(
        'browse',
        env,
        memoryStore(invalidRaw, saved),
        () => Effect.fail('unused'),
        () => Effect.fail('unused'),
      );
      Vitest.expect(received.length).toBe(1);
      Vitest.expect(received[0]?.instruction).toBe(Interactive.TRANSFORM_INSTRUCTION);
      Vitest.expect(saved).toStrictEqual(['test-skill']);
      Vitest.expect(notifies).toContain("Saved skill 'test-skill'.");
      Vitest.expect(seen.length).toBe(2);
    }),
  );
});
