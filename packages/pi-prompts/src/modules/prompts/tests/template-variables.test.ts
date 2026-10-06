import { Schema } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Prompts from '../index.js';

/** A variable with every field resolved, as `VariableEntry` produces. */
const variable = (
  name: string,
  overrides: Partial<{
    label: string;
    description: string;
    type: 'text' | 'textarea';
    required: boolean;
    default: string;
  }> = {},
): Prompts.Variable =>
  new Prompts.Variable({
    name,
    label: overrides.label ?? name,
    description: overrides.description ?? '',
    type: overrides.type ?? 'text',
    required: overrides.required ?? true,
    default: overrides.default ?? '',
  });

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
  readonly type?: 'text' | 'textarea';
  readonly required?: boolean;
  readonly default?: string;
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
    Vitest.expect(encode(decode('files'))).toStrictEqual({ name: 'files' });
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
