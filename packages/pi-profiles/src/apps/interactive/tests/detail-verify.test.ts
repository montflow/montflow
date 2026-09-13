import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Interactive from '../index.js';
import * as PiProfiles from '../../../modules/pi-profiles/index.js';

const validRaw = `---
name: code-reviewer
description: Reviews code.
model: ''
---

# Code Reviewer

## Instructions

Be strict.

## Review Checklist

- [ ] Flag issues
`;

const invalidRaw = `---
description: Reviews code.
---

No sections here.
`;

const scriptedUi = (answers: {
  readonly selects?: ReadonlyArray<string | undefined>;
  readonly inputs?: ReadonlyArray<string | undefined>;
  readonly notifies?: Array<string>;
}): Interactive.InteractiveUi => {
  let si = 0;
  let ii = 0;
  return {
    select: (_title, _choices) => Promise.resolve(answers.selects?.[si++]),
    confirm: () => Promise.resolve(false),
    input: () => Promise.resolve(answers.inputs?.[ii++]),
    notify: (message) => {
      answers.notifies?.push(message);
    },
  };
};

const testProfile = PiProfiles.decodeUnknown({
  name: 'code-reviewer',
  description: 'Reviews code.',
  model: '',
  skills: [],
  instructions: 'Be strict.',
  checklist: ['Flag issues'],
}).pipe(Effect.runSync);

const memoryStore = (raw: string, saved: Array<string>): Interactive.ProfileStore => ({
  list: () => Effect.succeed([testProfile]),
  save: (candidate) =>
    Effect.sync(() => {
      saved.push(candidate.name);
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
  cwd: '/tmp/profiles-test',
  models: [],
  modelPicker: undefined,
  loading: undefined,
  installer: () => Effect.fail('installer should not run'),
  menu,
  transform: () => Effect.fail('unused'),
});

Vitest.describe('Interactive.detailOptions', () => {
  Vitest.it('hides the fix entry while verified', () => {
    Vitest.expect(Interactive.detailOptions({ valid: true, issues: [] })).toStrictEqual([
      'Show',
      'Modify',
      'Re-verify',
      'Delete',
      'Back',
    ]);
  });

  Vitest.it('shows the fix entry near the bottom while unverified', () => {
    Vitest.expect(
      Interactive.detailOptions({
        valid: false,
        issues: [{ field: 'body', message: 'Missing.' }],
      }),
    ).toStrictEqual(['Show', 'Modify', 'Re-verify', 'Delete', 'Fix to standard', 'Back']);
  });
});

Vitest.describe('Interactive.detail verify panel', () => {
  Vitest.it.effect('shows the cross panel and fix entry for an unverified profile', () =>
    Effect.gen(function* () {
      const seen: Array<{
        readonly title: string;
        readonly info: ReadonlyArray<string>;
        readonly options: ReadonlyArray<string>;
      }> = [];
      const ui = scriptedUi({ selects: ['code-reviewer', 'Back'] });
      yield* Interactive.run(
        'browse',
        envFor(ui, menuQueue(seen, ['Back'])),
        memoryStore(invalidRaw, []),
        { list: () => Effect.succeed([]) },
        () => Effect.fail('unused'),
        () => Effect.fail('unused'),
      );
      Vitest.expect(seen).toStrictEqual([
        {
          title: "Profile 'code-reviewer'",
          info: ['✗ not verified — 3 issues'],
          options: ['Show', 'Modify', 'Re-verify', 'Delete', 'Fix to standard', 'Back'],
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
      const ui = scriptedUi({ selects: ['code-reviewer', 'Back'], notifies });
      yield* Interactive.run(
        'browse',
        envFor(ui, menuQueue(seen, ['Re-verify', 'Back'])),
        memoryStore(invalidRaw, []),
        { list: () => Effect.succeed([]) },
        () => Effect.fail('unused'),
        () => Effect.fail('unused'),
      );
      Vitest.expect(seen.length).toBe(2);
      Vitest.expect(notifies.length).toBe(1);
      Vitest.expect(notifies[0]).toContain("✗ 'code-reviewer' has 3 issues:");
      Vitest.expect(notifies[0]).toContain('[body]');
    }),
  );

  Vitest.it.effect('fix runs the fixer with model picker and optional extra prompt', () =>
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
        selects: ['code-reviewer', 'Continue with checked skills', 'Back'],
        inputs: ['Also mention security.'],
        notifies,
      });
      const env: Interactive.CommandEnv = {
        ...envFor(ui, menuQueue(seen, ['Fix to standard', 'Back'])),
        models: [{ label: 'a/m', current: true }],
        modelPicker: () => Promise.resolve('a/m'),
        transform: (input) => {
          received.push(input);
          return Effect.succeed(input.profile);
        },
      };
      yield* Interactive.run(
        'browse',
        env,
        memoryStore(invalidRaw, saved),
        { list: () => Effect.succeed([]) },
        () => Effect.fail('unused'),
        () => Effect.fail('unused'),
      );
      Vitest.expect(received.length).toBe(1);
      Vitest.expect(received[0]?.modelLabel).toBe('a/m');
      Vitest.expect(received[0]?.instruction).toContain('Bring this profile into the standard');
      Vitest.expect(received[0]?.instruction).toContain('Also mention security.');
      Vitest.expect(saved).toStrictEqual(['code-reviewer']);
      Vitest.expect(notifies).toContain("Saved profile 'code-reviewer'.");
      Vitest.expect(seen.length).toBe(2);
    }),
  );

  Vitest.it('verifies a valid file', () => {
    const result = PiProfiles.verifyProfileFile('code-reviewer', validRaw);
    Vitest.expect(result.valid).toBe(true);
    Vitest.expect(PiProfiles.verifyInfoLine(result)).toBe('✓ verified');
  });
});
