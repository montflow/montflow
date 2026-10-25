import { Effect, Layer } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Cli from '../index.js';
import * as Interactive from '../../interactive/index.js';
import * as Engines from '../engines.apps.module.js';
import * as PromptExecute from '../../../modules/prompt-execute/index.js';
import { PromptStore } from '../../../services/index.js';

/** A minimal standard-shaped prompt file for the `commit` slug. */
const validRaw = JSON.stringify({
  name: 'commit',
  description: 'Does X.',
  template: 'Do X.',
  variables: [],
  skills: [],
  model: '',
});

/** Prompt file whose empty template is the only verification issue. */
const invalidRaw = JSON.stringify({
  name: 'commit',
  description: 'Does X.',
  template: '',
  variables: [],
  skills: [],
  model: '',
});

/** Stub store serving one raw prompt; every other method fails as unused. */
const stubLayer = (raw: string): Layer.Layer<PromptStore.PromptStore> =>
  Layer.succeed(
    PromptStore.PromptStore,
    PromptStore.PromptStore.of({
      list: () => Effect.succeed([]),
      remove: () => Effect.fail(new PromptStore.StoreError({ message: 'unused' })),
      save: () => Effect.fail(new PromptStore.StoreError({ message: 'unused' })),
      readRaw: () => Effect.succeed(raw),
      readAllRaw: () => Effect.succeed([{ name: 'commit', raw }]),
    }),
  );

/** Notify-only UI: dialogs reject so any prompt attempt fails the test. */
const scriptedUi = (notifies: Array<string>): Interactive.InteractiveUi => ({
  select: () => Promise.reject(new Error('CLI must not prompt')),
  confirm: () => Promise.reject(new Error('CLI must not prompt')),
  input: () => Promise.reject(new Error('CLI must not prompt')),
  notify: (message) => {
    notifies.push(message);
  },
});

Vitest.describe('Cli.parseCliArgs runtime', () => {
  Vitest.it('parses verify with a name', () => {
    Vitest.expect(Cli.parseCliArgs('verify commit')).toStrictEqual({
      kind: 'Verify',
      name: 'commit',
      all: false,
      dir: undefined,
    });
  });

  Vitest.it('parses verify --all without a name', () => {
    Vitest.expect(Cli.parseCliArgs('verify --all')).toStrictEqual({
      kind: 'Verify',
      name: undefined,
      all: true,
      dir: undefined,
    });
  });

  Vitest.it('treats bare verify as verify --all', () => {
    Vitest.expect(Cli.parseCliArgs('verify')).toStrictEqual({
      kind: 'Verify',
      name: undefined,
      all: true,
      dir: undefined,
    });
  });
});

/** Executor port stub: fails as unused — these cases never run a prompt. */
const unusedExecutor: PromptExecute.PromptExecutor = () =>
  Effect.fail('executor must not be called');

Vitest.describe('Cli.run runtime', () => {
  Vitest.it.effect('notifies success for a valid prompt file', () =>
    Effect.gen(function* () {
      const notifies: Array<string> = [];
      yield* Cli.run('verify commit', scriptedUi(notifies), '/repo', unusedExecutor).pipe(
        Effect.provide(stubLayer(validRaw)),
      );
      Vitest.expect(notifies).toStrictEqual(["✓ 'commit' matches the standard format."]);
    }),
  );

  Vitest.it.effect('notifies the fix-oriented report and fails for an invalid file', () =>
    Effect.gen(function* () {
      const notifies: Array<string> = [];
      const error = yield* Cli.run(
        'verify commit',
        scriptedUi(notifies),
        '/repo',
        unusedExecutor,
      ).pipe(Effect.provide(stubLayer(invalidRaw)), Effect.flip);
      Vitest.expect(error).toContain('failed verification');
      Vitest.expect(notifies.length).toBe(1);
      Vitest.expect(notifies[0]).toContain("✗ 'commit' has 1 issue.");
      Vitest.expect(notifies[0]).toContain('1. [template]');
      Vitest.expect(notifies[0]).toContain('Fix: Write the prompt text.');
    }),
  );

  Vitest.it.effect('hands back the variables JSON when coverage is wrong', () =>
    Effect.gen(function* () {
      const notifies: Array<string> = [];
      const unordered = JSON.stringify({
        name: 'audit',
        description: 'Audits.',
        template: 'Audit {{files}}{{#if scope}} in {{scope}}{{/if}}',
        variables: [{ name: 'scope', required: false }, { name: 'files' }],
        skills: [],
        model: '',
      });
      yield* Cli.run('verify audit', scriptedUi(notifies), '/repo', unusedExecutor).pipe(
        Effect.provide(stubLayer(unordered)),
        Effect.flip,
      );
      Vitest.expect(notifies[0]).toContain('first-appearance order');
      Vitest.expect(notifies[0]).toContain('"name": "files"');
    }),
  );
});

Vitest.describe('Engines.parseVariableSpec runtime', () => {
  Vitest.it('defaults a bare name to required with no default', () =>
    Vitest.expect(Engines.parseVariableSpec('files').pipe(Effect.runSync)).toMatchObject({
      name: 'files',
      label: 'files',
      required: true,
      default: '',
    }),
  );

  Vitest.it('reads the o flag as optional', () =>
    Vitest.expect(Engines.parseVariableSpec('scope:o').pipe(Effect.runSync)).toMatchObject({
      name: 'scope',
      required: false,
      default: '',
    }),
  );

  Vitest.it('reads d=<text> as a default, which also makes the variable optional', () =>
    Vitest.expect(Engines.parseVariableSpec('focus:d=security').pipe(Effect.runSync)).toMatchObject(
      {
        name: 'focus',
        required: false,
        default: 'security',
      },
    ),
  );

  Vitest.it('reads flags in either order', () =>
    Vitest.expect(
      Engines.parseVariableSpec('focus:od=security').pipe(Effect.runSync),
    ).toMatchObject({
      required: false,
      default: 'security',
    }),
  );

  Vitest.it('rejects a name that is not a legal flat segment', () =>
    Vitest.expect(Engines.parseVariableSpec('my-var').pipe(Effect.runSyncExit)).toMatchObject({
      _tag: 'Failure',
    }),
  );
});

Vitest.describe('Cli.parseCliArgs variables flag', () => {
  Vitest.it('accepts a single --variable spec', () => {
    Vitest.expect(
      Cli.parseCliArgs('create audit --template "T {{x}}" --variable x:o'),
    ).toStrictEqual({
      kind: 'Create',
      name: 'audit',
      template: 'T {{x}}',
      description: undefined,
      model: undefined,
      skills: undefined,
      variables: ['x:o'],
      dir: undefined,
    });
  });

  Vitest.it('accepts a comma-separated list of specs', () => {
    const action = Cli.parseCliArgs('create audit --template "T" --variable a,b:o');
    Vitest.expect(action).toMatchObject({ kind: 'Create', variables: ['a', 'b:o'] });
  });

  Vitest.it('leaves modify template undefined when not passed, so the stored one is kept', () => {
    const action = Cli.parseCliArgs('modify audit --description "New summary"');
    Vitest.expect(action).toMatchObject({ kind: 'Modify', name: 'audit', template: undefined });
  });

  Vitest.it('falls back to Help for the removed plural --variables flag', () => {
    Vitest.expect(Cli.parseCliArgs('create audit --template "T" --variables a')).toStrictEqual({
      kind: 'Help',
    });
  });
});
