import { Schema } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Prompts from '../index.js';

/** A condition in its resolved form, as `VariableEntry` produces. */
const when = (fields: {
  readonly controller: string;
  readonly equals?: string;
  readonly truthy?: true;
}): Prompts.VariableCondition => fields;

/** The resolved fields a test variable is built from, before defaults apply. */
interface VariableInput {
  name: string;
  label: string;
  description: string;
  type: 'text' | 'textarea' | 'select' | 'confirm';
  options?: readonly string[];
  required: boolean;
  default: string;
  when?: Prompts.VariableCondition;
}

/** A variable with every field resolved, as `VariableEntry` produces. */
const variable = (
  name: string,
  overrides: Partial<{
    label: string;
    description: string;
    type: 'text' | 'textarea' | 'select' | 'confirm';
    options: readonly string[];
    required: boolean;
    default: string;
    when: Prompts.VariableCondition;
  }> = {},
): Prompts.Variable => {
  const input: VariableInput = {
    name,
    label: overrides.label ?? name,
    description: overrides.description ?? '',
    type: overrides.type ?? 'text',
    required: overrides.required ?? true,
    default: overrides.default ?? '',
  };
  if (overrides.options !== undefined) input.options = overrides.options;
  if (overrides.when !== undefined) input.when = overrides.when;
  return new Prompts.Variable(input);
};

Vitest.describe('Prompts.templateVariables', () => {
  Vitest.it('returns unique variables in first-appearance order', () => {
    Vitest.expect(Prompts.templateVariables('a {{x}} b {{y}} {{x}}')).toStrictEqual(['x', 'y']);
  });

  Vitest.it('includes a name that only guards a branch, at its guard position', () => {
    Vitest.expect(
      Prompts.templateVariables('intro {{lead}}{{#if scope}}mid{{/if}} outro {{tail}}'),
    ).toStrictEqual(['lead', 'scope', 'tail']);
  });
  Vitest.it('trims inner whitespace and ignores templates without tokens', () => {
    Vitest.expect(Prompts.templateVariables('{{ x }} then {{x}}')).toStrictEqual(['x']);
    Vitest.expect(Prompts.templateVariables('no tokens here')).toStrictEqual([]);
    Vitest.expect(Prompts.templateVariables('')).toStrictEqual([]);
  });

  Vitest.it('returns nothing for a template that does not parse', () => {
    Vitest.expect(Prompts.templateVariables('{{#if a}}unclosed')).toStrictEqual([]);
  });
});

Vitest.describe('Prompts.resolveValues', () => {
  Vitest.it('prefers the supplied value, falls back to the default, then to empty', () => {
    const variables = [
      variable('supplied', { default: 'from default' }),
      variable('defaulted', { default: 'from default' }),
      variable('blank'),
    ];
    Vitest.expect(
      Prompts.resolveValues(variables, { supplied: 'from user', defaulted: '' }),
    ).toStrictEqual([
      { name: 'supplied', value: 'from user' },
      { name: 'defaulted', value: 'from default' },
      { name: 'blank', value: '' },
    ]);
  });

  Vitest.it('ignores values for undeclared names', () => {
    Vitest.expect(Prompts.resolveValues([variable('a')], { a: '1', extra: '2' })).toStrictEqual([
      { name: 'a', value: '1' },
    ]);
  });

  Vitest.it('resolves a hidden variable to empty and drops its stale answer', () => {
    Vitest.expect(
      Prompts.resolveValues([isolated, origin], { isolated: 'no', origin: 'main' }),
    ).toStrictEqual([
      { name: 'isolated', value: 'no' },
      { name: 'origin', value: '' },
    ]);
    Vitest.expect(
      Prompts.resolveValues([isolated, origin], { isolated: 'yes', origin: 'main' }),
    ).toStrictEqual([
      { name: 'isolated', value: 'yes' },
      { name: 'origin', value: 'main' },
    ]);
  });
});

/** A select controller plus its conditional child, the common shape. */
const isolated = variable('isolated', {
  type: 'select',
  options: ['yes', 'no'],
  required: true,
});
const origin = variable('origin', {
  required: false,
  when: when({ controller: 'isolated', equals: 'yes' }),
});

Vitest.describe('Prompts.isVisible', () => {
  Vitest.it('treats a variable without a condition as always visible', () => {
    Vitest.expect(Prompts.isVisible('isolated', [isolated, origin], {})).toBe(true);
  });

  Vitest.it('compares the controller effective value: supplied, default, then empty', () => {
    Vitest.expect(Prompts.isVisible('origin', [isolated, origin], { isolated: 'yes' })).toBe(true);
    Vitest.expect(Prompts.isVisible('origin', [isolated, origin], { isolated: 'no' })).toBe(false);
    const defaulted = variable('isolated', {
      type: 'select',
      options: ['yes', 'no'],
      default: 'yes',
    });
    Vitest.expect(Prompts.isVisible('origin', [defaulted, origin], {})).toBe(true);
    Vitest.expect(Prompts.isVisible('origin', [isolated, origin], {})).toBe(false);
  });

  Vitest.it('hides a dependent when its controller is itself hidden', () => {
    const gate = variable('gate', {
      required: false,
      when: when({ controller: 'isolated', equals: 'yes' }),
    });
    const child = variable('child', {
      required: false,
      when: when({ controller: 'gate', equals: 'go' }),
    });
    Vitest.expect(
      Prompts.isVisible('child', [isolated, gate, child], { isolated: 'no', gate: 'go' }),
    ).toBe(false);
  });

  Vitest.it('resolves truthy visibility through a confirm controller', () => {
    const flag = variable('flag', { type: 'confirm', required: false });
    const child = variable('child', {
      required: false,
      when: when({ controller: 'flag', truthy: true }),
    });
    Vitest.expect(Prompts.isVisible('child', [flag, child], { flag: 'yes' })).toBe(true);
    Vitest.expect(Prompts.isVisible('child', [flag, child], { flag: '' })).toBe(false);
    Vitest.expect(Prompts.isVisible('child', [flag, child], {})).toBe(false);
  });

  Vitest.it('keeps a dependent hidden when its confirm controller is hidden', () => {
    const gate = variable('gate', {
      type: 'confirm',
      required: false,
      when: when({ controller: 'isolated', equals: 'yes' }),
    });
    const child = variable('child', {
      required: false,
      when: when({ controller: 'gate', truthy: true }),
    });
    Vitest.expect(
      Prompts.isVisible('child', [isolated, gate, child], { isolated: 'no', gate: 'yes' }),
    ).toBe(false);
    Vitest.expect(
      Prompts.isVisible('child', [isolated, gate, child], { isolated: 'yes', gate: 'yes' }),
    ).toBe(true);
  });

  Vitest.it('lists visible variables in declaration order', () => {
    Vitest.expect(
      Prompts.visibleVariables([isolated, origin], { isolated: 'yes' }).map((entry) => entry.name),
    ).toStrictEqual(['isolated', 'origin']);
    Vitest.expect(
      Prompts.visibleVariables([isolated, origin], { isolated: 'no' }).map((entry) => entry.name),
    ).toStrictEqual(['isolated']);
  });
});

Vitest.describe('Prompts.missingRequired', () => {
  Vitest.it('names only required variables with no default and no answer', () => {
    const variables = [
      variable('needed'),
      variable('answered'),
      variable('defaulted', { required: false, default: 'x' }),
      variable('skippable', { required: false }),
    ];
    Vitest.expect(Prompts.missingRequired(variables, { answered: 'here' })).toStrictEqual([
      'needed',
    ]);
  });

  Vitest.it('is empty when every required variable has a value or a default', () => {
    Vitest.expect(Prompts.missingRequired([variable('a', { default: 'x' })], {})).toStrictEqual([]);
  });

  Vitest.it('never reports a hidden required variable as missing', () => {
    const requiredOrigin = variable('origin', {
      required: true,
      when: when({ controller: 'isolated', equals: 'yes' }),
    });
    Vitest.expect(
      Prompts.missingRequired([isolated, requiredOrigin], { isolated: 'no' }),
    ).toStrictEqual([]);
    Vitest.expect(
      Prompts.missingRequired([isolated, requiredOrigin], { isolated: 'yes' }),
    ).toStrictEqual(['origin']);
  });

  Vitest.it('never reports an unchecked confirm as missing', () => {
    const flag = variable('flag', { type: 'confirm', required: true });
    Vitest.expect(Prompts.missingRequired([flag], {})).toStrictEqual([]);
    Vitest.expect(Prompts.missingRequired([flag], { flag: 'yes' })).toStrictEqual([]);
  });
});

Vitest.describe('Prompts.renderToString', () => {
  const conditional =
    '{{#if scope}}Some text this is the scope: {{scope}}\n{{else}}Use the git to determine the unstaged changes that must be included.\n{{/if}}';

  Vitest.it('renders the then branch when the user supplied a value', () => {
    Vitest.expect(
      Prompts.renderToString(conditional, [variable('scope', { required: false })], {
        scope: 'packages/core',
      }),
    ).toBe('Some text this is the scope: packages/core\n');
  });

  Vitest.it('renders the else branch when the user left it blank', () => {
    Vitest.expect(
      Prompts.renderToString(conditional, [variable('scope', { required: false })], {
        scope: '',
      }),
    ).toBe('Use the git to determine the unstaged changes that must be included.\n');
  });

  Vitest.it('substitutes a default when the field is blank', () => {
    Vitest.expect(
      Prompts.renderToString('Focus: {{focus}}', [variable('focus', { default: 'security' })], {
        focus: '',
      }),
    ).toBe('Focus: security');
  });

  Vitest.it('does not HTML-escape the substituted value', () => {
    Vitest.expect(
      Prompts.renderToString('Run {{cmd}}', [variable('cmd')], { cmd: 'a && b <c>' }),
    ).toBe('Run a && b <c>');
  });

  Vitest.it('renders an undeclared reference as empty rather than throwing', () => {
    Vitest.expect(Prompts.renderToString('[{{ghost}}]', [], {})).toBe('[]');
  });

  Vitest.it('takes the else branch and substitutes nothing for a hidden variable', () => {
    const template = '{{#if origin}}from {{origin}}{{else}}current{{/if}}';
    Vitest.expect(
      Prompts.renderToString(template, [isolated, origin], {
        isolated: 'no',
        origin: 'stale answer',
      }),
    ).toBe('current');
    Vitest.expect(
      Prompts.renderToString(template, [isolated, origin], {
        isolated: 'yes',
        origin: 'main',
      }),
    ).toBe('from main');
    Vitest.expect(
      Prompts.renderToString('[{{origin}}]', [isolated, origin], {
        isolated: 'no',
        origin: 'stale answer',
      }),
    ).toBe('[]');
  });
});

/** Decode one `variables` entry from its on-disk form. */
const decodeEntry = (value: EncodedVariable): Prompts.Variable =>
  Schema.decodeUnknownSync(Prompts.VariableEntry)(value);

/** Encode one variable back to its on-disk form. */
const encodeEntry = (value: Prompts.Variable): EncodedVariable =>
  Schema.encodeSync(Prompts.VariableEntry)(value);

/** The optional-field JSON shape a `variables` entry takes on disk. */
interface VariableFileValue {
  readonly name: string;
  readonly label?: string;
  readonly description?: string;
  readonly type?: 'text' | 'textarea' | 'select' | 'confirm';
  readonly options?: readonly string[];
  readonly source?: 'specs';
  readonly internal?: boolean;
  readonly required?: boolean;
  readonly default?: string;
  readonly when?: {
    readonly controller: string;
    readonly equals?: string;
    readonly truthy?: true;
  };
}

/** Either accepted on-disk form: the legacy bare name, or the object. */
type EncodedVariable = string | VariableFileValue;

Vitest.describe('Prompts.VariableEntry codec', () => {
  const decode = decodeEntry;
  const encode = encodeEntry;

  Vitest.it('normalizes a legacy bare-string entry to a required variable', () => {
    Vitest.expect(decode('files')).toMatchObject({
      name: 'files',
      label: 'files',
      description: '',
      type: 'text',
      required: true,
      default: '',
    });
  });

  Vitest.it('applies every default for an object entry that omits fields', () => {
    Vitest.expect(decode({ name: 'scope' })).toMatchObject({
      name: 'scope',
      label: 'scope',
      required: true,
      default: '',
    });
  });

  Vitest.it('keeps every field the author stated', () => {
    Vitest.expect(
      decode({
        name: 'scope',
        label: 'Scope',
        description: 'What to limit to',
        type: 'textarea',
        required: false,
        default: 'all',
      }),
    ).toMatchObject({
      label: 'Scope',
      description: 'What to limit to',
      type: 'textarea',
      required: false,
      default: 'all',
    });
  });

  Vitest.it('encodes back to the minimal object, never growing default noise', () => {
    const encoded = encode(decode('files'));
    Vitest.expect(encoded).toStrictEqual({ name: 'files' });
    Vitest.expect(encoded).not.toHaveProperty('when');
  });

  Vitest.it('round-trips an equals condition with only the present form', () => {
    const file: VariableFileValue = {
      name: 'origin',
      when: { controller: 'isolated', equals: 'yes' },
    };
    Vitest.expect(encode(decode(file))).toStrictEqual(file);
  });

  Vitest.it('round-trips a truthy condition', () => {
    const file: VariableFileValue = {
      name: 'branch',
      when: { controller: 'flag', truthy: true },
    };
    Vitest.expect(encode(decode(file))).toStrictEqual(file);
  });

  Vitest.it('round-trips a confirm with no options, default, or required', () => {
    const file: VariableFileValue = {
      name: 'flag',
      label: 'Use a worktree?',
      type: 'confirm',
    };
    const decoded = decode(file);
    Vitest.expect(decoded).toMatchObject({
      name: 'flag',
      label: 'Use a worktree?',
      type: 'confirm',
      required: false,
      default: '',
    });
    Vitest.expect(decoded.options ?? []).toStrictEqual([]);
    Vitest.expect(encode(decoded)).toStrictEqual(file);
  });

  Vitest.it('round-trips a truthy condition on a confirm controller', () => {
    const file: VariableFileValue = {
      name: 'flag',
      type: 'confirm',
    };
    const decoded = decode(file);
    const child: VariableFileValue = {
      name: 'child',
      when: { controller: 'flag', truthy: true },
    };
    Vitest.expect(encode(decoded)).toStrictEqual(file);
    Vitest.expect(encode(decode(child))).toStrictEqual(child);
  });

  Vitest.it('encodes every non-default field it was given', () => {
    Vitest.expect(
      encode(decode({ name: 'scope', label: 'Scope', required: false, default: 'all' })),
    ).toStrictEqual({ name: 'scope', label: 'Scope', required: false, default: 'all' });
  });

  Vitest.it('round-trips a fully specified variable unchanged', () => {
    const file: VariableFileValue = {
      name: 'scope',
      label: 'Scope',
      description: 'What to limit to',
      type: 'textarea',
      required: false,
      default: 'src/',
    };
    Vitest.expect(encode(decode(file))).toStrictEqual(file);
  });

  Vitest.it('round-trips a select with options and a dynamic source', () => {
    const file: VariableFileValue = {
      name: 'spec',
      type: 'select',
      options: ['one', 'two'],
      source: 'specs',
      required: false,
    };
    Vitest.expect(encode(decode(file))).toStrictEqual(file);
  });

  Vitest.it('round-trips an internal variable the CLI fills', () => {
    const file: VariableFileValue = {
      name: 'state',
      type: 'textarea',
      internal: true,
    };
    Vitest.expect(encode(decode(file))).toStrictEqual(file);
  });
});

Vitest.describe('Prompts.make', () => {
  Vitest.it('derives required variables from the template in first-appearance order', () => {
    const prompt = Prompts.make(
      'audit',
      'Audit {{files}} for {{focus}}{{#if scope}} in {{scope}}{{/if}}',
    );
    Vitest.expect(prompt.variables.map((entry) => entry.name)).toStrictEqual([
      'files',
      'focus',
      'scope',
    ]);
    Vitest.expect(prompt.variables.every((entry) => entry.required)).toBe(true);
  });

  Vitest.it('keeps explicit variables instead of deriving them', () => {
    const prompt = Prompts.make('audit', 'Audit {{files}}', 'Audits.', '', [
      variable('files', { label: 'Files' }),
    ]);
    Vitest.expect(prompt.variables[0]?.label).toBe('Files');
  });
});
