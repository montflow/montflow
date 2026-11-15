import { Schema } from 'effect';
import * as Vitest from '@effect/vitest';
import * as PromptExecute from '../index.js';
import * as Prompts from '../../prompts/index.js';

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

/** Build a prompt from a template plus explicit variables. */
const prompt = (
  template: string,
  variables: ReadonlyArray<Prompts.Variable>,
  rest: { readonly model?: string; readonly skills?: readonly string[] } = {},
): Prompts.Prompt =>
  new Prompts.Prompt({
    name: 'commit',
    description: 'Draft a commit message.',
    template,
    variables: [...variables],
    skills: [...(rest.skills ?? [])],
    model: rest.model ?? '',
  });

/** The prompt from the feature request, in both branch states. */
const CONDITIONAL =
  '{{#if scope}}Some text this is the scope: {{scope}}\n{{else}}Use git to find the unstaged changes.\n{{/if}}';

Vitest.describe('PromptExecute.construct', () => {
  Vitest.it('renders and returns the text when everything is supplied', () => {
    const result = PromptExecute.construct({
      prompt: prompt(CONDITIONAL, [variable('scope', { required: false })]),
      values: { scope: 'src/' },
    });
    Vitest.expect(result).toMatchObject({ ok: true, prompt: 'commit' });
    if (!result.ok) return;
    Vitest.expect(result.text).toBe('Some text this is the scope: src/\n');
  });

  Vitest.it('applies a declared default when a value is omitted', () => {
    const result = PromptExecute.construct({
      prompt: prompt('Scope: {{scope}}', [variable('scope', { required: false, default: 'src/' })]),
    });
    Vitest.expect(result.ok).toBe(true);
    if (!result.ok) return;
    Vitest.expect(result.text).toBe('Scope: src/');
  });

  Vitest.it('constructs a prompt that pins no model', () => {
    const result = PromptExecute.construct({
      prompt: prompt('Do X.', []),
    });
    Vitest.expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    Vitest.expect(result.text).toBe('Do X.');
  });

  Vitest.it('renders the else branch when an optional value is left blank', () => {
    const result = PromptExecute.construct({
      prompt: prompt(CONDITIONAL, [variable('scope', { required: false })]),
    });
    Vitest.expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    Vitest.expect(result.text).toBe('Use git to find the unstaged changes.\n');
  });

  Vitest.it('refuses a missing required variable, naming it and the gap', () => {
    const result = PromptExecute.construct({
      prompt: prompt('{{a}} {{b}}', [variable('a'), variable('b')]),
    });
    Vitest.expect(result.ok).toBe(false);
    if (result.ok) return;
    Vitest.expect(result.problem).toBe('missing-variables');
    Vitest.expect(result.missing).toStrictEqual(['a', 'b']);
    Vitest.expect(result.message).toContain('needs 2 required values');
    Vitest.expect(result.message).toContain('a=<value>');
    Vitest.expect(result.message).toContain('b=<value>');
  });

  Vitest.it('uses the singular for one missing value', () => {
    const result = PromptExecute.construct({
      prompt: prompt('{{a}}', [variable('a')]),
    });
    Vitest.expect(result.ok).toBe(false);
    if (result.ok) return;
    Vitest.expect(result.message).toContain('needs 1 required value.');
  });

  Vitest.it('names the construct command in the missing-values advice', () => {
    const result = PromptExecute.construct({
      prompt: prompt('{{a}}', [variable('a')]),
      invocation: '/mf-prompts construct',
    });
    Vitest.expect(result.ok).toBe(false);
    if (result.ok) return;
    Vitest.expect(result.message).toContain("/mf-prompts construct 'commit' a=<value>");
  });

  Vitest.it('refuses an invalid discrete value with the shared option wording', () => {
    const result = PromptExecute.construct({
      prompt: prompt('Pick {{x}}', [variable('x', { type: 'select', options: ['one', 'two'] })]),
      values: { x: 'three' },
    });
    Vitest.expect(result.ok).toBe(false);
    if (result.ok) return;
    Vitest.expect(result.problem).toBe('invalid-values');
    Vitest.expect(result.message).toContain("'three' is not an option of 'x' (select)");
    Vitest.expect(result.message).toContain('one, two');
  });

  Vitest.it('refuses an invalid confirm answer with the shared wording', () => {
    // A confirm only guards a branch; it is never substituted. Verification
    // accepts the guard form, and `construct` then refuses the out-of-options
    // answer with the shared confirm wording.
    const result = PromptExecute.construct({
      prompt: prompt('{{#if a}}go{{else}}stop{{/if}}', [
        variable('a', { type: 'confirm', required: false }),
      ]),
      values: { a: 'maybe' },
    });
    Vitest.expect(result.ok).toBe(false);
    if (result.ok) return;
    Vitest.expect(result.problem).toBe('invalid-values');
    Vitest.expect(result.message).toContain("'maybe' is not a valid answer for 'a' (confirm)");
  });

  Vitest.it('blocks an empty template before anything else', () => {
    const result = PromptExecute.construct({ prompt: prompt('   ', []) });
    Vitest.expect(result).toMatchObject({ ok: false, problem: 'empty-template' });
  });

  Vitest.it('blocks an unparseable template before anything else', () => {
    const result = PromptExecute.construct({ prompt: prompt('{{#if a}}unclosed', []) });
    Vitest.expect(result).toMatchObject({ ok: false, problem: 'invalid-template' });
  });

  Vitest.it('points an unparseable template at verify', () => {
    const result = PromptExecute.construct({ prompt: prompt('{{#if a}}unclosed', []) });
    Vitest.expect(result.ok).toBe(false);
    if (result.ok) return;
    Vitest.expect(result.message).toContain("verify 'commit'");
  });

  Vitest.it('refuses a prompt file that does not pass verification', () => {
    // Regression: an undeclared template reference must be refused, exactly as
    // `execute` refuses it, so `construct` accepts the same files as the legacy
    // `render`/`execute` commands.
    const result = PromptExecute.construct({
      prompt: new Prompts.Prompt({
        name: 'audit',
        description: 'Audits.',
        template: 'Do X about {{scope}}{{branch}}',
        variables: [variable('scope')],
        skills: [],
        model: '',
      }),
      values: { scope: 'src/' },
    });
    Vitest.expect(result).toMatchObject({ ok: false, problem: 'invalid-prompt' });
    if (result.ok) return;
    Vitest.expect(result.message).toContain("'branch'");
    Vitest.expect(result.message).toContain('verify');
  });

  Vitest.it('decodes a prompt file and constructs it', () => {
    const decoded = Schema.decodeUnknownSync(Prompts.Prompt)({
      name: 'commit',
      description: 'Draft a commit message.',
      template: CONDITIONAL,
      variables: [{ name: 'scope', required: false }],
      skills: [],
      model: '',
    });
    const result = PromptExecute.construct({
      prompt: decoded,
      values: { scope: 'x' },
    });
    Vitest.expect(result).toMatchObject({ ok: true, text: 'Some text this is the scope: x\n' });
  });

  Vitest.it('applies defaults exactly as the file-level verification expects', () => {
    const result = PromptExecute.construct({
      prompt: prompt('{{a}}', [variable('a', { required: false, default: 'fallback' })]),
      values: { a: '' },
    });
    Vitest.expect(result.ok).toBe(true);
    if (!result.ok) return;
    Vitest.expect(result.text).toBe('fallback');
  });
});
