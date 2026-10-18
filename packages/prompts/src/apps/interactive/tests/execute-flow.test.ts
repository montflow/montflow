import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Doctor from '../../doctor/index.js';
import * as Interactive from '../index.js';
import * as PromptExecute from '../../../modules/prompt-execute/index.js';
import * as Prompts from '../../../modules/prompts/index.js';

/** The prompt from the feature request: one required value, one optional. */
const prompt: Prompts.Prompt = Prompts.make(
  'commit-message',
  'Draft a message for {{files}}.\n{{#if scope}}Scope: {{scope}}{{else}}Scope: all.{{/if}}',
  'Draft a commit message.',
  '',
  [
    Prompts.requiredVariable('files'),
    new Prompts.Variable({
      name: 'scope',
      label: 'scope',
      description: '',
      type: 'text',
      required: false,
      default: '',
    }),
  ],
);

/** A pinned model, so no model dialog is needed. */
const pinned: Prompts.Prompt = Prompts.make(
  'commit-message',
  'Draft a message for {{files}}.',
  'Draft a commit message.',
  'pinned/model',
);

/** A repo root with the shipped skills installed, so the doctor gate passes. */
const readyRoot = (): Promise<string> =>
  Effect.gen(function* () {
    const root = yield* Effect.promise(() => mkdtemp(join(tmpdir(), 'mf-prompts-tui-')));
    yield* Doctor.runDoctor(root);
    return root;
  }).pipe(Effect.runPromise);

/** A repo root with no installed skills. */
const bareRoot = (): Promise<string> => mkdtemp(join(tmpdir(), 'mf-prompts-tui-bare-'));

const cleanup = (root: string): Effect.Effect<void> =>
  Effect.promise(() => rm(root, { recursive: true, force: true }));

/** One scripted dialog answer, and everything it was asked. */
interface Script {
  /** Answers for `input`, in order. */
  readonly inputs?: readonly string[];
  /** Answers for `select`, in order. */
  readonly selects?: readonly string[];
  /** Model labels the picker offers. */
  readonly models?: readonly string[];
  /** Notify messages. */
  readonly notifies: Array<string>;
  /** Executor requests, in order. */
  readonly runs: Array<PromptExecute.ExecutionRequest>;
}

/** A scripted UI plus the questions it was asked. */
interface ScriptedUi {
  readonly ui: Interactive.InteractiveUi;
}

/** UI stub that answers in order and records notifications into `script`. */
const scripted = (script: Script): ScriptedUi => {
  const inputs = [...(script.inputs ?? [])];
  const selects = [...(script.selects ?? [])];
  const ui: Interactive.InteractiveUi = {
    select: (title, options) => {
      const next = selects.shift() ?? options[0] ?? '';
      return Promise.resolve(next === '__cancel__' ? undefined : next);
    },
    confirm: () => Promise.resolve(false),
    input: () => Promise.resolve(inputs.shift()),
    notify: (message) => {
      script.notifies.push(message);
    },
  };
  return { ui };
};

/** Executor that records its request and replies with a marker. */
const recorder =
  (script: Script): PromptExecute.PromptExecutor =>
  (request) =>
    Effect.sync(() => {
      script.runs.push(request);
      return 'agent replied';
    });

/** Executor that always fails, for error-propagation cases. */
const failingExecutor: PromptExecute.PromptExecutor = () => Effect.fail("Unknown model 'nope'.");

/** Models offered by the picker: the first is the current session model. */
const models: ReadonlyArray<Interactive.ModelOption> = [
  { label: 'opencode-go/fast', current: true },
  { label: 'opencode-go/slow', current: false },
];

Vitest.describe('Interactive.executeFlow', () => {
  Vitest.it.effect('fills the required value and runs on the picked model', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(readyRoot);
      const script: Script = {
        inputs: ['src/', ''],
        selects: ['opencode-go/fast'],
        notifies: [],
        runs: [],
      };
      const { ui } = scripted(script);
      yield* Interactive.executeFlow(ui, root, prompt, models, {}, recorder(script));
      Vitest.expect(script.runs.length).toBe(1);
      // The stub answers the model menu with the first option.
      Vitest.expect(script.runs[0]?.model).toBe('opencode-go/fast');
      Vitest.expect(script.runs[0]?.text).toContain('Draft a message for src/.');
      // The optional scope is asked for but may be left blank.
      Vitest.expect(script.runs[0]?.text).toContain('Scope: all.');
      Vitest.expect(script.notifies).toContain('agent replied');
      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('uses the prompt pinned model without asking', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(readyRoot);
      const asked: Array<string> = [];
      const script: Script = { inputs: ['src/'], selects: [], notifies: [], runs: [] };
      const ui: Interactive.InteractiveUi = {
        select: () => Promise.reject(new Error('must not ask for a model')),
        confirm: () => Promise.reject(new Error('unused')),
        input: (title: string) => {
          asked.push(title);
          return Promise.resolve(asked.length === 1 ? 'src/' : '');
        },
        notify: (message: string) => {
          script.notifies.push(message);
        },
      };
      yield* Interactive.executeFlow(ui, root, pinned, models, {}, recorder(script));
      Vitest.expect(script.runs[0]?.model).toBe('pinned/model');
      // Only the variable is asked for; the model is never a question.
      Vitest.expect(asked).toStrictEqual(['files (1 of 1)']);
      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('uses the optional value when one is supplied', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(readyRoot);
      const script: Script = {
        inputs: ['src/', 'packages/core'],
        selects: ['opencode-go/fast'],
        notifies: [],
        runs: [],
      };
      const { ui } = scripted(script);
      yield* Interactive.executeFlow(ui, root, prompt, models, {}, recorder(script));
      Vitest.expect(script.runs[0]?.text).toContain('Scope: packages/core');
      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('does not ask for a value supplied on the command line', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(readyRoot);
      const asked: Array<string> = [];
      const script: Script = { inputs: [], selects: ['opencode-go/fast'], notifies: [], runs: [] };
      const ui: Interactive.InteractiveUi = {
        select: () => Promise.resolve('opencode-go/fast'),
        confirm: () => Promise.reject(new Error('unused')),
        input: (title: string) => {
          asked.push(title);
          return Promise.resolve('');
        },
        notify: (message: string) => {
          script.notifies.push(message);
        },
      };
      yield* Interactive.executeFlow(
        ui,
        root,
        prompt,
        models,
        { files: 'src/', scope: 'src/' },
        recorder(script),
      );
      Vitest.expect(asked).toStrictEqual([]);
      Vitest.expect(script.runs[0]?.text).toContain('Scope: src/');
      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('fails before filling when the skills are not ready', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(bareRoot);
      const script: Script = { inputs: ['src/'], notifies: [], runs: [] };
      const { ui } = scripted(script);
      const error = yield* Interactive.executeFlow(
        ui,
        root,
        prompt,
        models,
        {},
        recorder(script),
      ).pipe(Effect.flip);
      Vitest.expect(script.runs).toStrictEqual([]);
      Vitest.expect(error).toContain('Prompts skills are not ready');
      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('fails before running when a skill has drifted', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(readyRoot);
      yield* Effect.promise(() =>
        writeFile(
          join(root, '.agents', 'skills', Doctor.SKILL_NAMES[0], 'SKILL.md'),
          'out of date\n',
          'utf8',
        ),
      );
      const script: Script = { inputs: ['src/'], notifies: [], runs: [] };
      const { ui } = scripted(script);
      const error = yield* Interactive.executeFlow(
        ui,
        root,
        prompt,
        models,
        {},
        recorder(script),
      ).pipe(Effect.flip);
      Vitest.expect(script.runs).toStrictEqual([]);
      Vitest.expect(error).toContain('differs from the packaged version');
      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('fails with the required-value message when the user cancels that field', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(readyRoot);
      const script: Script = { inputs: [], notifies: [], runs: [] };
      const { ui } = scripted(script);
      const error = yield* Interactive.executeFlow(
        ui,
        root,
        prompt,
        models,
        {},
        recorder(script),
      ).pipe(Effect.flip);
      Vitest.expect(script.runs).toStrictEqual([]);
      Vitest.expect(error).toBe(Interactive.CANCELLED);
      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('surfaces a model error rather than running with an unusable label', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(readyRoot);
      const script: Script = { inputs: ['src/', ''], selects: [], notifies: [], runs: [] };
      const { ui } = scripted(script);
      const error = yield* Interactive.executeFlow(
        ui,
        root,
        pinned,
        models,
        {},
        failingExecutor,
      ).pipe(Effect.flip);
      Vitest.expect(script.runs).toStrictEqual([]);
      Vitest.expect(error).toContain("Unknown model 'nope'.");
      yield* cleanup(root);
    }),
  );
});

Vitest.describe('Interactive.parseAction', () => {
  Vitest.it('parses execute with values', () => {
    Vitest.expect(Interactive.parseAction('execute commit files=src')).toStrictEqual({
      kind: 'Execute',
      name: 'commit',
      values: { files: 'src' },
    });
  });

  Vitest.it('parses inspect with values', () => {
    Vitest.expect(Interactive.parseAction('inspect commit files=src')).toStrictEqual({
      kind: 'Inspect',
      name: 'commit',
      values: { files: 'src' },
    });
  });

  Vitest.it('opens the menu for a bare execute or inspect', () => {
    Vitest.expect(Interactive.parseAction('execute')).toStrictEqual({ kind: 'Menu' });
    Vitest.expect(Interactive.parseAction('inspect')).toStrictEqual({ kind: 'Menu' });
  });

  Vitest.it('still treats a lone unknown token as show', () => {
    Vitest.expect(Interactive.parseAction('commit')).toStrictEqual({
      kind: 'Show',
      name: 'commit',
    });
  });
});
