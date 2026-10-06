import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Interactive from '../index.js';
import * as Prompts from '../../../modules/prompts/index.js';

/** A variable with every field resolved. */
const variable = (
  name: string,
  rest: Partial<{ required: boolean; default: string; label: string }> = {},
): Prompts.Variable =>
  new Prompts.Variable({
    name,
    label: rest.label ?? name,
    description: '',
    type: 'text',
    required: rest.required ?? true,
    default: rest.default ?? '',
  });

/** A scripted UI plus the list of dialog titles it was asked for. */
interface ScriptedUi {
  readonly ui: Interactive.InteractiveUi;
  readonly asked: Array<string>;
}

/** UI stub that answers each prompt in turn and records what was asked. */
const scriptedUi = (answers: readonly string[]): ScriptedUi => {
  const asked: Array<string> = [];
  const queue = [...answers];
  return {
    asked,
    ui: {
      select: () => Promise.reject(new Error('select must not be called')),
      confirm: () => Promise.reject(new Error('confirm must not be called')),
      input: (title: string) => {
        asked.push(title);
        return Promise.resolve(queue.shift() ?? '');
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

Vitest.describe('Interactive.fillInputs', () => {
  Vitest.it('asks for a required variable and fails when the answer is blank', () =>
    Effect.gen(function* () {
      const { ui, asked } = scriptedUi(['']);
      const error = yield* Interactive.fillInputs(ui, promptOf([variable('files')]), {}).pipe(
        Effect.flip,
      );
      Vitest.expect(asked).toHaveLength(1);
      Vitest.expect(error).toBe("Value for 'files' must not be empty.");
    }),
  );

  Vitest.it('accepts a blank answer for an optional variable', () =>
    Effect.gen(function* () {
      const { ui, asked } = scriptedUi(['']);
      const collected = yield* Interactive.fillInputs(
        ui,
        promptOf([variable('files'), variable('scope', { required: false })]),
        { files: 'src/' },
      );
      Vitest.expect(asked).toHaveLength(1);
      Vitest.expect(collected).toStrictEqual({ files: 'src/', scope: '' });
    }),
  );

  Vitest.it('never asks for a variable that has a default', () =>
    Effect.gen(function* () {
      const { ui, asked } = scriptedUi([]);
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

  Vitest.it('asks once per unanswered variable and numbers the prompts', () =>
    Effect.gen(function* () {
      const { ui, asked } = scriptedUi(['a', 'b']);
      yield* Interactive.fillInputs(ui, promptOf([variable('one'), variable('two')]), {});
      Vitest.expect(asked).toStrictEqual(['one (1 of 2)', 'two (2 of 2)']);
    }),
  );

  Vitest.it('marks an optional field as skippable in its placeholder', () =>
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

  Vitest.it('uses the label, not the name, in the prompt title', () =>
    Effect.gen(function* () {
      const { ui, asked } = scriptedUi(['v']);
      yield* Interactive.fillInputs(
        ui,
        promptOf([variable('files', { label: 'Files to audit' })]),
        {},
      );
      Vitest.expect(asked[0]).toBe('Files to audit (1 of 1)');
    }),
  );

  Vitest.it('skips every variable when a re-fill already answered them all', () =>
    Effect.gen(function* () {
      const { ui, asked } = scriptedUi([]);
      const collected = yield* Interactive.fillInputs(
        ui,
        promptOf([variable('files'), variable('scope', { required: false })]),
        { files: 'src/', scope: '' },
      );
      Vitest.expect(asked).toStrictEqual([]);
      Vitest.expect(collected).toStrictEqual({ files: 'src/', scope: '' });
    }),
  );

  Vitest.it('fails with CANCELLED when the user dismisses a dialog', () =>
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
});
