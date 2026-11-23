import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Interactive from '../index.js';
import * as Prompts from '../../../modules/prompts/index.js';

/** A variable with every field resolved. */
const variable = (
  name: string,
  rest: Partial<{
    required: boolean;
    default: string;
    label: string;
    type: 'text' | 'textarea' | 'select' | 'confirm';
    options: ReadonlyArray<string>;
    when: Prompts.VariableCondition;
  }> = {},
): Prompts.Variable => {
  const base = {
    name,
    label: rest.label ?? name,
    description: '',
    type: rest.type ?? 'text',
    required: rest.required ?? true,
    default: rest.default ?? '',
  };
  const withOptions = rest.options === undefined ? base : { ...base, options: [...rest.options] };
  const withWhen = rest.when === undefined ? withOptions : { ...withOptions, when: rest.when };
  return new Prompts.Variable(withWhen);
};

/** One scripted dialog answer, in the order the dialogs are opened. */
interface Script {
  /** Answers for `input`, in order. */
  readonly inputs?: readonly string[];
  /** Answers for `select`, in order. */
  readonly selects?: readonly string[];
  /** Answers for `confirm`, in order. */
  readonly confirms?: readonly boolean[];
}

/** A scripted UI plus what it was asked for. */
interface ScriptedUi {
  readonly ui: Interactive.InteractiveUi;
  readonly asked: Array<string>;
  readonly offered: Array<ReadonlyArray<string>>;
}

/** UI stub that answers each prompt in turn and records what was asked. */
const scriptedUi = (script: Script = {}): ScriptedUi => {
  const asked: Array<string> = [];
  const offered: Array<ReadonlyArray<string>> = [];
  const inputs = [...(script.inputs ?? [])];
  const selects = [...(script.selects ?? [])];
  const confirms = [...(script.confirms ?? [])];
  return {
    asked,
    offered,
    ui: {
      select: (title: string, options: string[]) => {
        asked.push(title);
        offered.push([...options]);
        return Promise.resolve(selects.shift());
      },
      confirm: (title: string) => {
        if (confirms.length === 0) return Promise.reject(new Error('confirm must not be called'));
        asked.push(title);
        return Promise.resolve(confirms.shift() ?? false);
      },
      input: (title: string) => {
        asked.push(title);
        return Promise.resolve(inputs.shift());
      },
      notify: () => undefined,
    },
  };
};

const promptOf = (variables: ReadonlyArray<Prompts.Variable>): Prompts.Prompt =>
  Prompts.make(
    'audit',
    'Audit {{files}}{{#if scope}} in {{scope}}{{/if}}',
    'Audits.',
    '',
    variables,
  );

/** The G001 branch: isolation decides whether origin and worktree exist. */
const branchVariables = (): ReadonlyArray<Prompts.Variable> => [
  variable('isolated', { type: 'select', options: ['yes', 'no'] }),
  variable('origin', {
    type: 'select',
    options: ['current', 'main', 'other'],
    when: { controller: 'isolated', equals: 'yes' },
  }),
  variable('worktree_name', { when: { controller: 'isolated', equals: 'yes' } }),
];

const branchPrompt = (): Prompts.Prompt =>
  Prompts.make(
    'audit',
    'Isolated: {{isolated}}{{#if origin}} origin={{origin}}{{/if}}{{#if worktree_name}} worktree={{worktree_name}}{{/if}}',
    'Audits.',
    '',
    branchVariables(),
  );

Vitest.describe('Interactive.fillInputs', () => {
  Vitest.it.effect('asks for a required variable and fails when the answer is blank', () =>
    Effect.gen(function* () {
      const { ui, asked } = scriptedUi({ inputs: [''] });
      const error = yield* Interactive.fillInputs(ui, promptOf([variable('files')]), {}).pipe(
        Effect.flip,
      );
      Vitest.expect(asked).toHaveLength(1);
      Vitest.expect(error).toBe("Value for 'files' must not be empty.");
    }),
  );

  Vitest.it.effect('accepts a blank answer for an optional variable', () =>
    Effect.gen(function* () {
      const { ui, asked } = scriptedUi({ inputs: [''] });
      const collected = yield* Interactive.fillInputs(
        ui,
        promptOf([variable('files'), variable('scope', { required: false })]),
        { files: 'src/' },
      );
      Vitest.expect(asked).toHaveLength(1);
      Vitest.expect(collected).toStrictEqual({ files: 'src/', scope: '' });
    }),
  );

  Vitest.it.effect('never asks for a variable that has a default', () =>
    Effect.gen(function* () {
      const { ui, asked } = scriptedUi();
      const focus = [variable('focus', { default: 'security' })];
      const collected = yield* Interactive.fillInputs(ui, promptOf(focus), {});
      Vitest.expect(asked).toStrictEqual([]);
      Vitest.expect(collected).toStrictEqual({});
      // The default still renders, because resolution happens at render time.
      Vitest.expect(Prompts.renderToString('Focus: {{focus}}', focus, collected)).toBe(
        'Focus: security',
      );
    }),
  );

  Vitest.it.effect('lets a defaulted controller answer on the first fill', () =>
    Effect.gen(function* () {
      const { ui, asked } = scriptedUi();
      const collected = yield* Interactive.fillInputs(
        ui,
        promptOf([
          variable('isolated', {
            type: 'select',
            options: ['yes', 'no'],
            default: 'no',
            required: false,
          }),
          variable('origin', { when: { controller: 'isolated', equals: 'yes' } }),
        ]),
        {},
      );
      Vitest.expect(asked).toStrictEqual([]);
      Vitest.expect(collected).toStrictEqual({});
    }),
  );

  Vitest.it.effect('asks once per unanswered variable and numbers the prompts', () =>
    Effect.gen(function* () {
      const { ui, asked } = scriptedUi({ inputs: ['a', 'b'] });
      yield* Interactive.fillInputs(ui, promptOf([variable('one'), variable('two')]), {});
      Vitest.expect(asked).toStrictEqual(['one (1 of 2)', 'two (2 of 2)']);
    }),
  );

  Vitest.it.effect('marks an optional field as skippable in its placeholder', () =>
    Effect.gen(function* () {
      const placeholders: Array<string | undefined> = [];
      const ui: Interactive.InteractiveUi = {
        select: () => Promise.reject(new Error('unused')),
        confirm: () => Promise.reject(new Error('unused')),
        input: (_title, placeholder) => {
          placeholders.push(placeholder);
          return Promise.resolve('x');
        },
        notify: () => undefined,
      };
      yield* Interactive.fillInputs(ui, promptOf([variable('scope', { required: false })]), {});
      Vitest.expect(placeholders).toStrictEqual(['optional — leave blank to skip']);
    }),
  );

  Vitest.it.effect('uses the label, not the name, in the prompt title', () =>
    Effect.gen(function* () {
      const { ui, asked } = scriptedUi({ inputs: ['v'] });
      yield* Interactive.fillInputs(
        ui,
        promptOf([variable('files', { label: 'Files to audit' })]),
        {},
      );
      Vitest.expect(asked[0]).toBe('Files to audit (1 of 1)');
    }),
  );

  Vitest.it.effect('skips every answered variable on a re-fill', () =>
    Effect.gen(function* () {
      const { ui, asked } = scriptedUi();
      const collected = yield* Interactive.fillInputs(
        ui,
        promptOf([variable('files'), variable('scope', { required: false })]),
        { files: 'src/', scope: 'lib/' },
      );
      Vitest.expect(asked).toStrictEqual([]);
      Vitest.expect(collected).toStrictEqual({ files: 'src/', scope: 'lib/' });
    }),
  );

  Vitest.it.effect('fails with CANCELLED when the user dismisses a dialog', () =>
    Effect.gen(function* () {
      const ui: Interactive.InteractiveUi = {
        select: () => Promise.reject(new Error('unused')),
        confirm: () => Promise.reject(new Error('unused')),
        input: () => Promise.resolve(undefined),
        notify: () => undefined,
      };
      const error = yield* Interactive.fillInputs(ui, promptOf([variable('files')]), {}).pipe(
        Effect.flip,
      );
      Vitest.expect(error).toBe(Interactive.CANCELLED);
    }),
  );

  Vitest.it.effect('offers a select as its options, not a free-text line', () =>
    Effect.gen(function* () {
      const { ui, asked, offered } = scriptedUi({ selects: ['yes'] });
      const collected = yield* Interactive.fillInputs(
        ui,
        promptOf([variable('isolated', { type: 'select', options: ['yes', 'no'] })]),
        {},
      );
      Vitest.expect(asked).toStrictEqual(['isolated (1 of 1)']);
      Vitest.expect(offered).toStrictEqual([['yes', 'no']]);
      Vitest.expect(collected).toStrictEqual({ isolated: 'yes' });
    }),
  );

  Vitest.it.effect('uses a select default without asking', () =>
    Effect.gen(function* () {
      const { ui, asked } = scriptedUi();
      const collected = yield* Interactive.fillInputs(
        ui,
        promptOf([
          variable('origin', {
            type: 'select',
            options: ['current', 'main'],
            default: 'main',
            required: false,
          }),
        ]),
        {},
      );
      Vitest.expect(asked).toStrictEqual([]);
      Vitest.expect(collected).toStrictEqual({});
    }),
  );

  Vitest.it('verifies its branch fixture through the real file verifier', () => {
    const raw = JSON.stringify(Prompts.encode(branchPrompt()));
    Vitest.expect(Prompts.verifyPromptFile('audit', raw)).toStrictEqual({
      valid: true,
      issues: [],
    });
  });

  Vitest.it.effect('asks origin and worktree on the yes path', () =>
    Effect.gen(function* () {
      const { ui, asked, offered } = scriptedUi({
        selects: ['yes', 'main'],
        inputs: ['wt'],
      });
      const collected = yield* Interactive.fillInputs(ui, branchPrompt(), {});
      Vitest.expect(asked).toStrictEqual([
        'isolated (1 of 1)',
        'origin (1 of 2)',
        'worktree_name (2 of 2)',
      ]);
      Vitest.expect(offered[1]).toStrictEqual(['current', 'main', 'other']);
      Vitest.expect(collected).toStrictEqual({
        isolated: 'yes',
        origin: 'main',
        worktree_name: 'wt',
      });
    }),
  );

  Vitest.it.effect('counts only the questions a fully answered re-fill will ask', () =>
    Effect.gen(function* () {
      const { ui, asked } = scriptedUi({ selects: ['yes'] });
      const collected = yield* Interactive.fillInputs(ui, branchPrompt(), {
        isolated: 'yes',
        origin: 'main',
        worktree_name: 'wt',
      });
      Vitest.expect(asked).toStrictEqual(['isolated (1 of 1)']);
      Vitest.expect(collected).toStrictEqual({
        isolated: 'yes',
        origin: 'main',
        worktree_name: 'wt',
      });
    }),
  );

  Vitest.it.effect('asks neither branch on the no path', () =>
    Effect.gen(function* () {
      const { ui, asked } = scriptedUi({ selects: ['no'] });
      const collected = yield* Interactive.fillInputs(ui, branchPrompt(), {});
      Vitest.expect(asked).toStrictEqual(['isolated (1 of 1)']);
      Vitest.expect(collected).toStrictEqual({ isolated: 'no' });
    }),
  );

  Vitest.it.effect('clears hidden answers on a yes→no switch and asks them again on yes', () =>
    Effect.gen(function* () {
      const prompt = branchPrompt();
      const firstUi = scriptedUi({ selects: ['yes', 'main'], inputs: ['wt'] });
      const first = yield* Interactive.fillInputs(firstUi.ui, prompt, {});
      Vitest.expect(first).toStrictEqual({
        isolated: 'yes',
        origin: 'main',
        worktree_name: 'wt',
      });

      const secondUi = scriptedUi({ selects: ['no'] });
      const second = yield* Interactive.fillInputs(secondUi.ui, prompt, first);
      Vitest.expect(second).toStrictEqual({ isolated: 'no' });
      Vitest.expect(secondUi.asked).toStrictEqual(['isolated (1 of 1)']);

      const thirdUi = scriptedUi({ selects: ['yes', 'current'], inputs: ['again'] });
      const third = yield* Interactive.fillInputs(thirdUi.ui, prompt, second);
      Vitest.expect(thirdUi.asked).toStrictEqual([
        'isolated (1 of 1)',
        'origin (1 of 2)',
        'worktree_name (2 of 2)',
      ]);
      Vitest.expect(third).toStrictEqual({
        isolated: 'yes',
        origin: 'current',
        worktree_name: 'again',
      });
    }),
  );

  Vitest.it.effect('keeps only re-fill answers that are still visible', () =>
    Effect.gen(function* () {
      const { ui, asked } = scriptedUi({ selects: ['no'] });
      const collected = yield* Interactive.fillInputs(ui, branchPrompt(), {
        isolated: 'no',
        origin: 'main',
        worktree_name: 'stale',
      });
      Vitest.expect(asked).toStrictEqual(['isolated (1 of 1)']);
      Vitest.expect(collected).toStrictEqual({ isolated: 'no' });
    }),
  );

  Vitest.it.effect('never asks a controller that a caller supplied', () =>
    Effect.gen(function* () {
      const { ui, asked } = scriptedUi({ selects: ['main'], inputs: ['wt'] });
      const collected = yield* Interactive.fillInputs(
        ui,
        branchPrompt(),
        { isolated: 'yes' },
        { provided: new Set(['isolated']) },
      );
      Vitest.expect(asked).toStrictEqual(['origin (1 of 2)', 'worktree_name (2 of 2)']);
      Vitest.expect(collected).toStrictEqual({
        isolated: 'yes',
        origin: 'main',
        worktree_name: 'wt',
      });
    }),
  );

  Vitest.it.effect('asks a confirm through the confirm dialog, never as free text', () =>
    Effect.gen(function* () {
      const { ui, asked, offered } = scriptedUi({ confirms: [true] });
      const collected = yield* Interactive.fillInputs(
        ui,
        promptOf([variable('flag', { type: 'confirm', required: false })]),
        {},
      );
      Vitest.expect(asked).toStrictEqual(['flag (1 of 1)']);
      Vitest.expect(offered).toStrictEqual([]);
      Vitest.expect(collected).toStrictEqual({ flag: 'yes' });
    }),
  );

  Vitest.it.effect('stores an unchecked confirm as the canonical empty answer', () =>
    Effect.gen(function* () {
      const { ui } = scriptedUi({ confirms: [false] });
      const collected = yield* Interactive.fillInputs(
        ui,
        promptOf([variable('flag', { type: 'confirm', required: false })]),
        {},
      );
      Vitest.expect(collected).toStrictEqual({ flag: '' });
    }),
  );

  Vitest.it.effect('gates a dependent on a confirm and clears it when unchecked', () =>
    Effect.gen(function* () {
      const prompt = promptOf([
        variable('flag', { type: 'confirm', required: false }),
        variable('child', {
          required: false,
          when: { controller: 'flag', truthy: true },
        }),
      ]);
      const firstUi = scriptedUi({ confirms: [true], inputs: ['x'] });
      const first = yield* Interactive.fillInputs(firstUi.ui, prompt, {});
      Vitest.expect(firstUi.asked).toStrictEqual(['flag (1 of 1)', 'child (1 of 1)']);
      Vitest.expect(first).toStrictEqual({ flag: 'yes', child: 'x' });

      const secondUi = scriptedUi({ confirms: [false] });
      const second = yield* Interactive.fillInputs(secondUi.ui, prompt, first);
      Vitest.expect(secondUi.asked).toStrictEqual(['flag (1 of 1)']);
      Vitest.expect(second).toStrictEqual({ flag: '' });
    }),
  );
});
