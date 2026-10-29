import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import * as Vitest from '@effect/vitest';
import * as Interactive from '../index.js';
import * as Profiles from '../../../modules/profile/index.js';

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

/** Platform layers for the detail-panel skill-resolution test. */
const NodeLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

const testProfile = Profiles.decodeUnknown({
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
    const result = Profiles.verifyProfileFile('code-reviewer', validRaw);
    Vitest.expect(result.valid).toBe(true);
    Vitest.expect(Profiles.verifyInfoLine(result)).toBe('✓ verified');
  });

  Vitest.it('counts failures apart from warnings in the detail line', () => {
    const result: Profiles.VerifyResult = {
      valid: false,
      issues: [
        { field: 'body', message: 'Missing the checklist.' },
        { field: 'skills', message: 'Missing skill.', severity: 'warning' },
      ],
    };
    Vitest.expect(Profiles.verifyInfoLine(result)).toBe('✗ not verified — 1 issue · 1 warning');
  });

  Vitest.it('counts failures apart from warnings in the re-verify notification', () => {
    const notifies: Array<string> = [];
    const ui = scriptedUi({ notifies });
    Interactive.notifyVerifyResult(ui, 'broken', {
      valid: false,
      issues: [
        { field: 'body', message: 'Missing the checklist.' },
        { field: 'skills', message: 'Missing skill.', severity: 'warning' },
      ],
    }).pipe(Effect.runSync);
    Vitest.expect(notifies[0]).toContain("✗ 'broken' has 1 issue · 1 warning:");
    Vitest.expect(notifies[0]).toContain('• [skills] Missing skill.');
  });

  Vitest.it('renders a warning-only re-verify result as a warning, not clean', () => {
    const notifies: Array<string> = [];
    const ui = scriptedUi({ notifies });
    Interactive.notifyVerifyResult(ui, 'effect-reviewer', {
      valid: true,
      issues: [{ field: 'skills', message: 'Missing skill.', severity: 'warning' }],
    }).pipe(Effect.runSync);
    Vitest.expect(notifies[0]).toBe("✓ 'effect-reviewer' matches the standard format — 1 warning.");
  });

  Vitest.it.effect('names a broken skill reference in the detail panel instead of silence', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-profiles-detail-skill-' });
      yield* fs.makeDirectory(`${dir}/.agents/skills/effect`, { recursive: true });
      yield* fs.writeFileString(`${dir}/.agents/skills/effect/SKILL.md`, '# effect\n');
      const rawWithMissing = `---\nname: code-reviewer\ndescription: Reviews code.\nskills:\n  - missing-skill\n---\n\n# Code Reviewer\n\n## Instructions\n\nBe strict.\n\n## Review Checklist\n\n- [ ] Flag issues\n`;

      const seen: Array<{
        readonly title: string;
        readonly info: ReadonlyArray<string>;
        readonly options: ReadonlyArray<string>;
      }> = [];
      const ui = scriptedUi({ selects: ['code-reviewer', 'Back'] });
      const env: Interactive.CommandEnv = { ...envFor(ui, menuQueue(seen, ['Back'])), cwd: dir };
      yield* Interactive.run(
        'browse',
        env,
        memoryStore(rawWithMissing, []),
        { list: () => Effect.succeed([]) },
        () => Effect.fail('unused'),
        () => Effect.fail('unused'),
      );
      Vitest.expect(seen[0]?.info).toStrictEqual(['✓ verified — 1 warning']);
    }).pipe(Effect.provide(NodeLive), Effect.scoped),
  );
});
