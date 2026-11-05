import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Prompts from '../index.js';

/** A prompt whose last variable is a condition candidate. */
const rawPrompt = {
  name: 'conditional',
  description: 'Render a branch.',
  template:
    '{{#if origin}}Branch {{origin}}.{{else}}Current.{{/if}}{{#if request}} Request: {{request}}.{{/if}}{{#if later}}{{later}}{{/if}}',
  variables: [
    { name: 'request', type: 'text' },
    { name: 'isolated', type: 'select', options: ['yes', 'no'], required: true },
    {
      name: 'origin',
      type: 'select',
      options: ['current', 'main', 'other'],
      when: { controller: 'isolated', equals: 'yes' },
    },
    { name: 'later', type: 'text' },
  ],
  skills: [],
  model: '',
};

/** Load the runtime and decode the fixture through the real schema. */
const loadPrompt = () =>
  Effect.gen(function* () {
    const libs = yield* Prompts.loadPrompts();
    const prompt = yield* libs.Prompts.decodeUnknown(rawPrompt);
    return { libs, prompt };
  });

/** Position of a variable in the fixture. */
const indexOf = (variables: ReadonlyArray<{ readonly name: string }>, name: string): number =>
  variables.findIndex((variable) => variable.name === name);

Vitest.describe('prompt editor conditions', () => {
  Vitest.it.effect('offers only earlier discrete controllers and their options', () =>
    Effect.gen(function* () {
      const { prompt } = yield* loadPrompt();
      const controllers = Prompts.conditionControllers(
        prompt.variables,
        indexOf(prompt.variables, 'origin'),
      );
      Vitest.expect(controllers.map((controller) => controller.name)).toStrictEqual(['isolated']);
      Vitest.expect(controllers[0]?.values).toStrictEqual(['yes', 'no']);
    }),
  );

  Vitest.it.effect('stores the condition a controller and value produce', () =>
    Effect.gen(function* () {
      const { prompt } = yield* loadPrompt();
      const index = indexOf(prompt.variables, 'origin');
      const controller = Prompts.conditionControllers(prompt.variables, index)[0];
      if (controller === undefined) throw new Error('fixture controller missing');
      const when = Prompts.chooseCondition(controller, 'yes');
      Vitest.expect(when).toStrictEqual({ controller: 'isolated', equals: 'yes' });
      const edit = Prompts.applyCondition(prompt.variables, index, when ?? { controller: '' });
      Vitest.expect(edit.ok).toBe(true);
      if (!edit.ok) throw new Error(edit.message);
      Vitest.expect(edit.variables[index]?.when).toStrictEqual({
        controller: 'isolated',
        equals: 'yes',
      });
    }),
  );

  Vitest.it.effect('refuses every condition G001 rejects', () =>
    Effect.gen(function* () {
      const { prompt } = yield* loadPrompt();
      const origin = indexOf(prompt.variables, 'origin');
      const isolated = indexOf(prompt.variables, 'isolated');
      const cases: ReadonlyArray<{
        readonly at: number;
        readonly when: {
          readonly controller: string;
          readonly equals?: string;
          readonly truthy?: true;
        };
        readonly message: string;
      }> = [
        {
          at: origin,
          when: { controller: 'missing', equals: 'yes' },
          message: 'is not a declared variable',
        },
        { at: isolated, when: { controller: 'origin', equals: 'current' }, message: 'before' },
        { at: origin, when: { controller: 'request', equals: 'x' }, message: 'has type text' },
        {
          at: origin,
          when: { controller: 'isolated', equals: 'maybe' },
          message: 'is not an option',
        },
        { at: origin, when: { controller: 'isolated', truthy: true }, message: 'requires select' },
        {
          at: origin,
          when: { controller: 'isolated', equals: 'yes', truthy: true },
          message: 'exactly one',
        },
        { at: origin, when: { controller: 'isolated' }, message: 'exactly one' },
      ];
      for (const testCase of cases) {
        const edit = Prompts.applyCondition(prompt.variables, testCase.at, testCase.when);
        Vitest.expect(edit.ok).toBe(false);
        if (edit.ok) throw new Error(`accepted an invalid condition: ${testCase.message}`);
        Vitest.expect(edit.message).toContain(testCase.message);
      }
    }),
  );

  Vitest.it.effect('applies a condition picked by name and surfaces each refusal', () =>
    Effect.gen(function* () {
      const { prompt } = yield* loadPrompt();
      const accepted = Prompts.applyConditionByName(prompt.variables, 'origin', 'isolated', 'yes');
      Vitest.expect(accepted.ok).toBe(true);
      if (!accepted.ok) throw new Error(accepted.message);
      Vitest.expect(accepted.variables[indexOf(accepted.variables, 'origin')]?.when).toStrictEqual({
        controller: 'isolated',
        equals: 'yes',
      });

      const unknownVariable = Prompts.applyConditionByName(
        prompt.variables,
        'missing',
        'isolated',
        'yes',
      );
      Vitest.expect(unknownVariable).toStrictEqual({
        ok: false,
        message: "Unknown variable 'missing'.",
      });

      const laterController = Prompts.applyConditionByName(
        prompt.variables,
        'isolated',
        'origin',
        'current',
      );
      Vitest.expect(laterController.ok).toBe(false);
      if (laterController.ok) throw new Error('accepted a later controller');
      Vitest.expect(laterController.message).toContain("cannot control 'isolated'");

      const unoffered = Prompts.applyConditionByName(
        prompt.variables,
        'origin',
        'isolated',
        'maybe',
      );
      Vitest.expect(unoffered.ok).toBe(false);
      if (unoffered.ok) throw new Error('accepted an unoffered value');
      Vitest.expect(unoffered.message).toContain("'maybe' is not an offered answer");
    }),
  );

  Vitest.it('accepts a truthy confirm answer and rejects an unchecked one', () => {
    const controller: Prompts.ConditionController = {
      name: 'flag',
      label: 'Flag',
      form: 'truthy',
      values: ['yes'],
    };
    Vitest.expect(Prompts.chooseCondition(controller, 'yes')).toStrictEqual({
      controller: 'flag',
      truthy: true,
    });
    Vitest.expect(Prompts.chooseCondition(controller, 'no')).toBeUndefined();
  });
});

Vitest.describe('prompt editor round-trip', () => {
  Vitest.it.effect('saves and reopens a conditional prompt with its condition intact', () =>
    Effect.gen(function* () {
      const { prompt } = yield* loadPrompt();
      const index = indexOf(prompt.variables, 'origin');
      const edit = Prompts.applyCondition(prompt.variables, index, {
        controller: 'isolated',
        equals: 'yes',
      });
      if (!edit.ok) return yield* Effect.fail(edit.message);
      const root = mkdtempSync(join(tmpdir(), 'mf-workspace-prompt-'));
      try {
        yield* Prompts.savePrompt(root, {
          ...Prompts.fromPrompt(prompt),
          variables: edit.variables,
        });
        const rows = yield* Prompts.fetchPrompts(root);
        const reopened = rows[0];
        Vitest.expect(reopened?.variables[index]?.when).toStrictEqual({
          controller: 'isolated',
          equals: 'yes',
        });
        const raw = readFileSync(
          join(root, '.agents', '@montflow', 'prompts', 'conditional.json'),
          'utf8',
        );
        // SAFETY: `savePrompt` wrote this file from the decoded prompt; the
        // assertion below checks the one field this test reads.
        const onDisk = JSON.parse(raw) as {
          variables: ReadonlyArray<{ name: string; when?: unknown }>;
        };
        const saved = onDisk.variables.find((variable) => variable.name === 'origin');
        Vitest.expect(saved?.when).toStrictEqual({ controller: 'isolated', equals: 'yes' });
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }),
  );
});

Vitest.describe('prompt editor confirm controller', () => {
  const rawConfirm = {
    name: 'confirm-flag',
    description: 'Confirm a flag.',
    template: 'Flag: {{flag}}.{{#if child}} Child: {{child}}.{{/if}}',
    variables: [
      { name: 'flag', type: 'confirm' },
      { name: 'child', required: false, when: { controller: 'flag', truthy: true } },
    ],
    skills: [],
    model: '',
  };

  Vitest.it.effect('accepts a confirm controller and round-trips it minimally', () =>
    Effect.gen(function* () {
      const libs = yield* Prompts.loadPrompts();
      const prompt = yield* libs.Prompts.decodeUnknown(rawConfirm);
      const flag = prompt.variables[0];
      Vitest.expect(flag).toMatchObject({ type: 'confirm', required: false, default: '' });
      Vitest.expect(flag?.options ?? []).toStrictEqual([]);

      const childIndex = indexOf(prompt.variables, 'child');
      Vitest.expect(Prompts.conditionControllers(prompt.variables, childIndex)).toStrictEqual([
        { name: 'flag', label: 'flag', form: 'truthy', values: ['yes'] },
      ]);
      const edit = Prompts.applyCondition(prompt.variables, childIndex, {
        controller: 'flag',
        truthy: true,
      });
      Vitest.expect(edit.ok).toBe(true);
      if (!edit.ok) throw new Error(edit.message);

      // The one visibility predicate sees a real confirm answer.
      Vitest.expect([...Prompts.hiddenVariableNames(libs, edit.variables, {})]).toContain('child');
      Vitest.expect([
        ...Prompts.hiddenVariableNames(libs, edit.variables, { flag: 'yes' }),
      ]).not.toContain('child');

      const root = mkdtempSync(join(tmpdir(), 'mf-workspace-confirm-'));
      try {
        yield* Prompts.savePrompt(root, {
          ...Prompts.fromPrompt(prompt),
          variables: edit.variables,
        });
        const rows = yield* Prompts.fetchPrompts(root);
        const reopened = rows[0];
        Vitest.expect(reopened?.variables[0]).toMatchObject({
          type: 'confirm',
          required: false,
          default: '',
        });
        Vitest.expect(reopened?.variables[1]?.when).toStrictEqual({
          controller: 'flag',
          truthy: true,
        });

        // SAFETY: `savePrompt` wrote this file from the decoded prompt; the
        // assertion below reads only each variable's name and kind.
        const onDisk = JSON.parse(
          readFileSync(join(root, '.agents', '@montflow', 'prompts', 'confirm-flag.json'), 'utf8'),
        ) as { variables: ReadonlyArray<{ readonly name: string; readonly type?: string }> };
        Vitest.expect(onDisk.variables[0]).toStrictEqual({ name: 'flag', type: 'confirm' });
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }),
  );
});

Vitest.describe('prompt visibility', () => {
  Vitest.it.effect('marks a conditional hidden until its controller matches', () =>
    Effect.gen(function* () {
      const { libs, prompt } = yield* loadPrompt();
      Vitest.expect([...Prompts.hiddenVariableNames(libs, prompt.variables)]).toContain('origin');
      Vitest.expect([
        ...Prompts.hiddenVariableNames(libs, prompt.variables, { isolated: 'yes' }),
      ]).not.toContain('origin');
    }),
  );
});
