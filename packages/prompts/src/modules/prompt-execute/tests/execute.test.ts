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
    type: 'text' | 'textarea';
  }> = {},
): Prompts.Variable =>
  new Prompts.Variable({
    name,
    label: rest.label ?? name,
    description: '',
    type: rest.type ?? 'text',
    required: rest.required ?? true,
    default: rest.default ?? '',
  });

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

Vitest.describe('PromptExecute.inspect', () => {
  Vitest.it('carries the prompt metadata through', () => {
    const summary = PromptExecute.inspect({
      prompt: prompt('Do X.', [], { model: 'opencode-go/fast', skills: ['planning-git-commits'] }),
    });
    Vitest.expect(summary.name).toBe('commit');
    Vitest.expect(summary.description).toBe('Draft a commit message.');
    Vitest.expect(summary.model).toBe('opencode-go/fast');
    Vitest.expect(summary.skills).toStrictEqual(['planning-git-commits']);
  });

  Vitest.it('reports each variable with its effective value', () => {
    const summary = PromptExecute.inspect({
      prompt: prompt('{{a}} {{b}} {{c}}', [
        variable('a'),
        variable('b', { default: 'fallback' }),
        variable('c', { required: false }),
      ]),
      values: { a: 'given' },
    });
    Vitest.expect(summary.variables.map((entry) => [entry.name, entry.value])).toStrictEqual([
      ['a', 'given'],
      ['b', 'fallback'],
      ['c', ''],
    ]);
  });

  Vitest.it('treats a blank supplied value as no value, so the default wins', () => {
    const summary = PromptExecute.inspect({
      prompt: prompt('{{a}}', [variable('a', { required: false, default: 'fallback' })]),
      values: { a: '' },
    });
    Vitest.expect(summary.variables[0]?.value).toBe('fallback');
  });

  Vitest.it('names only required, unanswered variables as missing', () => {
    const summary = PromptExecute.inspect({
      prompt: prompt('{{a}} {{b}} {{c}}', [
        variable('a'),
        variable('b', { required: false }),
        variable('c', { default: 'x' }),
      ]),
    });
    Vitest.expect(summary.missing).toStrictEqual(['a']);
  });

  Vitest.it('marks a variable that only guards a branch as conditional', () => {
    const summary = PromptExecute.inspect({
      prompt: prompt('{{#if scope}}limited{{else}}everything{{/if}}', [
        variable('scope', { required: false }),
      ]),
    });
    Vitest.expect(summary.variables[0]?.conditional).toBe(true);
  });

  Vitest.it('does not mark a substituted variable as conditional', () => {
    const summary = PromptExecute.inspect({
      prompt: prompt('{{#if a}}{{a}}{{/if}}', [variable('a', { required: false })]),
    });
    Vitest.expect(summary.variables[0]?.conditional).toBe(false);
  });

  Vitest.it('inspects a template with a syntax error instead of throwing', () => {
    const summary = PromptExecute.inspect({ prompt: prompt('{{#if a}}unclosed', []) });
    Vitest.expect(summary.variables).toStrictEqual([]);
  });
});

Vitest.describe('PromptExecute.table', () => {
  Vitest.it('aligns the variable columns to the widest cell', () => {
    const text = PromptExecute.table(
      PromptExecute.inspect({
        prompt: prompt('{{a}} {{longname}}', [
          variable('a', { required: false }),
          variable('longname'),
        ]),
      }),
    );
    const header = text.split('\n').find((line) => line.includes('NAME'));
    Vitest.expect(header).toBeDefined();
    // Every body row starts its NAME column at the same offset as the header.
    const rows = text.split('\n').filter((line) => /^\s{2}(a|longname)/u.test(line));
    Vitest.expect(rows.length).toBe(2);
    Vitest.expect(rows[0]?.indexOf('a')).toBe(rows[1]?.indexOf('longname'));
  });

  Vitest.it('renders a rule under the header', () => {
    const text = PromptExecute.table(
      PromptExecute.inspect({ prompt: prompt('{{a}}', [variable('a')]) }),
    );
    Vitest.expect(text).toMatch(/─+/u);
  });

  Vitest.it('shows metadata with a placeholder when empty', () => {
    const text = PromptExecute.table(PromptExecute.inspect({ prompt: prompt('Do X.', []) }));
    Vitest.expect(text).toContain('model     (none)');
    Vitest.expect(text).toContain('skills    (none)');
    Vitest.expect(text).toContain('variables 0 (0 required, 0 optional)');
  });

  Vitest.it('counts required and optional variables', () => {
    const text = PromptExecute.table(
      PromptExecute.inspect({
        prompt: prompt('{{a}} {{b}}', [variable('a'), variable('b', { required: false })]),
      }),
    );
    Vitest.expect(text).toContain('2 (1 required, 1 optional)');
  });

  Vitest.it('lists the missing required values and how to fix it', () => {
    const text = PromptExecute.table(
      PromptExecute.inspect({ prompt: prompt('{{a}}', [variable('a')]) }),
    );
    Vitest.expect(text).toContain('Missing required values: a');
    Vitest.expect(text).toContain('"required": false');
  });

  Vitest.it('shows a label that differs from the name', () => {
    const text = PromptExecute.table(
      PromptExecute.inspect({
        prompt: prompt('{{a}}', [variable('a', { label: 'Files to audit' })]),
      }),
    );
    Vitest.expect(text).toContain('a (Files to audit)');
  });

  Vitest.it('emits no ANSI escapes, so an agent can read it verbatim', () => {
    const text = PromptExecute.table(
      PromptExecute.inspect({ prompt: prompt('{{a}}', [variable('a')]) }),
    );
    // oxlint-disable-next-line no-control-regex -- asserting the absence of escapes is the point.
    Vitest.expect(/\[/u.test(text)).toBe(false);
  });
});

Vitest.describe('PromptExecute.execute', () => {
  Vitest.it('renders and returns a plan when everything is supplied', () => {
    const plan = PromptExecute.execute({
      prompt: prompt(CONDITIONAL, [variable('scope', { required: false })]),
      model: 'opencode-go/fast',
      values: { scope: 'src/' },
    });
    Vitest.expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    Vitest.expect(plan.model).toBe('opencode-go/fast');
    Vitest.expect(plan.text).toBe('Some text this is the scope: src/\n');
    Vitest.expect(plan.prompt).toBe('commit');
  });

  Vitest.it('falls back to the prompt own model when the caller passes none', () => {
    const plan = PromptExecute.execute({
      prompt: prompt('Do X.', [], { model: 'pinned/model' }),
    });
    Vitest.expect(plan).toMatchObject({ ok: true, model: 'pinned/model' });
  });

  Vitest.it('lets the caller override the pinned model', () => {
    const plan = PromptExecute.execute({
      prompt: prompt('Do X.', [], { model: 'pinned/model' }),
      model: 'other/model',
    });
    Vitest.expect(plan).toMatchObject({ ok: true, model: 'other/model' });
  });

  Vitest.it('defaults skills to the prompt own', () => {
    const plan = PromptExecute.execute({
      prompt: prompt('Do X.', [], { skills: ['planning-git-commits'] }),
      model: 'p/m',
    });
    Vitest.expect(plan).toMatchObject({ ok: true, skills: ['planning-git-commits'] });
  });

  Vitest.it('blocks with a model message that names the flag and the file', () => {
    const plan = PromptExecute.execute({ prompt: prompt('Do X.', []) });
    Vitest.expect(plan.ok).toBe(false);
    if (plan.ok) return;
    Vitest.expect(plan.problem).toBe('missing-model');
    Vitest.expect(plan.message).toContain('--model provider/model-id');
    Vitest.expect(plan.message).toContain('commit.json');
  });

  Vitest.it('blocks with a variables message that names each gap', () => {
    const plan = PromptExecute.execute({
      prompt: prompt('{{a}} {{b}}', [variable('a'), variable('b')]),
      model: 'p/m',
    });
    Vitest.expect(plan.ok).toBe(false);
    if (plan.ok) return;
    Vitest.expect(plan.problem).toBe('missing-variables');
    Vitest.expect(plan.missing).toStrictEqual(['a', 'b']);
    Vitest.expect(plan.message).toContain('needs 2 required values');
    Vitest.expect(plan.message).toContain('a=<value>');
    Vitest.expect(plan.message).toContain('b=<value>');
  });

  Vitest.it('uses the singular for one missing value', () => {
    const plan = PromptExecute.execute({
      prompt: prompt('{{a}}', [variable('a')]),
      model: 'p/m',
    });
    Vitest.expect(plan.ok).toBe(false);
    if (plan.ok) return;
    Vitest.expect(plan.message).toContain('needs 1 required value.');
  });

  Vitest.it('accepts a partially supplied set and names only what is left', () => {
    const plan = PromptExecute.execute({
      prompt: prompt('{{a}} {{b}}', [variable('a'), variable('b')]),
      model: 'p/m',
      values: { a: 'x' },
    });
    Vitest.expect(plan.ok).toBe(false);
    if (plan.ok) return;
    Vitest.expect(plan.missing).toStrictEqual(['b']);
  });

  Vitest.it('does not demand an optional or defaulted variable', () => {
    const plan = PromptExecute.execute({
      prompt: prompt('{{a}} {{b}}', [variable('a'), variable('b', { required: false })]),
      model: 'p/m',
      values: { a: 'x' },
    });
    Vitest.expect(plan).toMatchObject({ ok: true });
  });

  Vitest.it('blocks an empty template before looking for a model', () => {
    const plan = PromptExecute.execute({ prompt: prompt('   ', []) });
    Vitest.expect(plan).toMatchObject({ ok: false, problem: 'empty-template' });
  });

  Vitest.it('blocks an unparseable template before looking for a model', () => {
    const plan = PromptExecute.execute({ prompt: prompt('{{#if a}}unclosed', []) });
    Vitest.expect(plan).toMatchObject({ ok: false, problem: 'invalid-template' });
  });

  Vitest.it('points an unparseable template at verify', () => {
    const plan = PromptExecute.execute({ prompt: prompt('{{#if a}}unclosed', []) });
    Vitest.expect(plan.ok).toBe(false);
    if (plan.ok) return;
    Vitest.expect(plan.message).toContain("verify 'commit'");
  });

  Vitest.it('checks the model before the variables, so one real problem is named', () => {
    const plan = PromptExecute.execute({ prompt: prompt('{{a}}', [variable('a')]) });
    Vitest.expect(plan).toMatchObject({ ok: false, problem: 'missing-model' });
  });

  Vitest.it('renders the else branch when an optional value is left blank', () => {
    const plan = PromptExecute.execute({
      prompt: prompt(CONDITIONAL, [variable('scope', { required: false })]),
      model: 'p/m',
    });
    Vitest.expect(plan).toMatchObject({ ok: true });
    if (!plan.ok) return;
    Vitest.expect(plan.text).toBe('Use git to find the unstaged changes.\n');
  });

  Vitest.it('decodes a prompt file into a runnable plan', () => {
    const decoded = Schema.decodeUnknownSync(Prompts.Prompt)({
      name: 'commit',
      description: 'Draft a commit message.',
      template: CONDITIONAL,
      variables: [{ name: 'scope', required: false }],
      skills: [],
      model: '',
    });
    const plan = PromptExecute.execute({ prompt: decoded, model: 'p/m', values: { scope: 'x' } });
    Vitest.expect(plan).toMatchObject({ ok: true, text: 'Some text this is the scope: x\n' });
  });
});

/** A prompt with an explicitly declared `scope`, and a name for the fixture. */
const fixture = (template: string, variables: ReadonlyArray<Prompts.Variable>) =>
  new Prompts.Prompt({
    name: 'audit',
    description: 'Audits.',
    template,
    variables: [...variables],
    skills: [],
    model: '',
  });

const required = (name: string) =>
  new Prompts.Variable({
    name,
    label: name,
    description: '',
    type: 'text',
    required: true,
    default: '',
  });

Vitest.describe('PromptExecute.execute file-level verification', () => {
  Vitest.it('blocks an undeclared variable, which would otherwise render as nothing', () => {
    // Regression: `execute` used to check only the template grammar, so a
    // template referencing an undeclared variable rendered anyway and
    // substituted nothing — the run silently lost the value the author expected.
    const plan = PromptExecute.execute({
      prompt: fixture('Do X about {{scope}}{{branch}}', [required('scope')]),
      model: 'p/m',
      values: { scope: 'src/' },
    });
    Vitest.expect(plan.ok).toBe(false);
    if (plan.ok) return;
    Vitest.expect(plan.problem).toBe('invalid-prompt');
    Vitest.expect(plan.message).toContain("'branch'");
    Vitest.expect(plan.message).toContain('verify');
  });

  Vitest.it('blocks a declared variable the template never uses', () => {
    const plan = PromptExecute.execute({
      prompt: fixture('Do X', [required('unused')]),
      model: 'p/m',
    });
    Vitest.expect(plan).toMatchObject({ ok: false, problem: 'invalid-prompt' });
  });

  Vitest.it('blocks variables listed out of first-appearance order', () => {
    const plan = PromptExecute.execute({
      prompt: fixture('{{a}}{{b}}', [required('b'), required('a')]),
      model: 'p/m',
      values: { a: '1', b: '2' },
    });
    Vitest.expect(plan).toMatchObject({ ok: false, problem: 'invalid-prompt' });
  });

  Vitest.it('accepts a prompt that passes verification', () => {
    const plan = PromptExecute.execute({
      prompt: fixture('Do X about {{scope}}', [required('scope')]),
      model: 'p/m',
      values: { scope: 'src/' },
    });
    Vitest.expect(plan).toMatchObject({ ok: true, text: 'Do X about src/' });
  });
});
