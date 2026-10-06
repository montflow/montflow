import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Vitest from '@effect/vitest';
import * as Prompts from '../index.js';

/** Raw contents of the repo's model `commit` prompt, read at test time. */
const modelRaw = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../../../.agents/@montflow/pi-prompts/commit.json',
  ),
  'utf8',
);

/** Optional fields a test may set on a `variables` entry. */
interface VariableOverride {
  readonly label?: string;
  readonly description?: string;
  readonly type?: 'text' | 'textarea';
  readonly required?: boolean;
  readonly default?: string;
}

/** Either accepted `variables` form: the legacy bare name, or the object. */
type VariableEntryFile = string | (VariableOverride & { readonly name: string });

const variableFile = (name: string, rest: VariableOverride = {}): VariableEntryFile => ({
  name,
  ...rest,
});

/** Build a prompt-file JSON with defaults for everything but `name`. */
const promptFile = (fields: {
  readonly name: string;
  readonly description?: string;
  readonly template?: string;
  readonly variables?: readonly VariableEntryFile[];
}): string =>
  JSON.stringify({
    name: fields.name,
    description: fields.description ?? 'Does X.',
    template: fields.template ?? 'Do X.',
    variables: fields.variables ?? [],
    skills: [],
    model: '',
  });

Vitest.describe('Prompts.verifyPromptFile runtime', () => {
  Vitest.it('accepts the repo model prompt file', () => {
    Vitest.expect(Prompts.verifyPromptFile('commit', modelRaw)).toStrictEqual({
      valid: true,
      issues: [],
    });
  });

  Vitest.it('reports unparseable JSON as a single json issue', () => {
    const result = Prompts.verifyPromptFile('commit', 'not json');
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues[0]?.field).toBe('json');
    Vitest.expect(result.issues[0]?.fix).toBeDefined();
  });

  Vitest.it('flags a name that does not match the file name', () => {
    const result = Prompts.verifyPromptFile('bad-example', promptFile({ name: 'wrong-name' }));
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues[0]?.field).toBe('name');
    Vitest.expect(result.issues[0]?.message).toBe("Must match the file name 'bad-example'.");
    Vitest.expect(result.issues[0]?.fix).toBe('Set "name" to "bad-example".');
  });

  Vitest.it('flags a name that is not a slug', () => {
    const result = Prompts.verifyPromptFile('Bad Name', promptFile({ name: 'Bad Name' }));
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues[0]?.message).toBe(
      'Must be lowercase alphanumeric groups joined by single hyphens.',
    );
  });

  Vitest.it('flags an empty description and template', () => {
    const result = Prompts.verifyPromptFile(
      'empty',
      promptFile({ name: 'empty', description: '', template: '' }),
    );
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues.map((found) => found.field)).toStrictEqual([
      'description',
      'template',
    ]);
  });
});

Vitest.describe('Prompts.verifyPromptFile variables', () => {
  Vitest.it('accepts the legacy bare-string form', () => {
    const result = Prompts.verifyPromptFile(
      'audit',
      promptFile({
        name: 'audit',
        template: 'Audit {{files}}',
        variables: ['files'],
      }),
    );
    Vitest.expect(result).toStrictEqual({ valid: true, issues: [] });
  });

  Vitest.it('accepts the object form with full metadata', () => {
    const result = Prompts.verifyPromptFile(
      'audit',
      promptFile({
        name: 'audit',
        template: 'Audit {{files}}{{#if scope}} in {{scope}}{{/if}}',
        variables: [
          variableFile('files', { label: 'Files', type: 'textarea' }),
          variableFile('scope', { required: false }),
        ],
      }),
    );
    Vitest.expect(result).toStrictEqual({ valid: true, issues: [] });
  });

  Vitest.it('flags a referenced variable that is not declared', () => {
    const result = Prompts.verifyPromptFile(
      'audit',
      promptFile({
        name: 'audit',
        template: 'Audit {{files}} for {{focus}}',
        variables: [variableFile('files')],
      }),
    );
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues[0]?.message).toBe(
      "Template uses 'focus' but it is not listed in 'variables'.",
    );
  });

  Vitest.it('flags a name that only guards a branch when it is not declared', () => {
    const result = Prompts.verifyPromptFile(
      'audit',
      promptFile({
        name: 'audit',
        template: '{{#if scope}}in {{scope}}{{/if}}',
        variables: [],
      }),
    );
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues[0]?.message).toContain("Template uses 'scope'");
  });

  Vitest.it('flags a declared variable the template never uses', () => {
    const result = Prompts.verifyPromptFile(
      'audit',
      promptFile({
        name: 'audit',
        template: 'Audit {{files}}',
        variables: [variableFile('files'), variableFile('focus')],
      }),
    );
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues[0]?.message).toBe(
      "'focus' is listed in 'variables' but not used in the template.",
    );
  });

  Vitest.it('flags a duplicated declared variable', () => {
    const result = Prompts.verifyPromptFile(
      'audit',
      promptFile({
        name: 'audit',
        template: 'Audit {{files}}',
        variables: [variableFile('files'), variableFile('files')],
      }),
    );
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues[0]?.message).toBe("'files' is listed more than once.");
  });

  Vitest.it('flags out-of-order variables and hands back the exact JSON to paste', () => {
    const result = Prompts.verifyPromptFile(
      'audit',
      promptFile({
        name: 'audit',
        template: '{{#if scope}}in {{scope}}{{/if}}Audit {{files}}',
        variables: [variableFile('files'), variableFile('scope')],
      }),
    );
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues[0]?.message).toBe("'variables' must be in first-appearance order.");
    Vitest.expect(result.expectedVariables).toBe(
      '[\n  {\n    "name": "scope",\n    "required": true\n  },\n  {\n    "name": "files",\n    "required": true\n  }\n]',
    );
  });
  Vitest.it('flags a declared name that is not a legal flat segment', () => {
    const result = Prompts.verifyPromptFile(
      'audit',
      promptFile({
        name: 'audit',
        template: 'Audit {{files}}',
        variables: [variableFile('files'), variableFile('my-var')],
      }),
    );
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues[0]?.message).toBe("'my-var' is not a usable variable name.");
    Vitest.expect(result.issues[0]?.fix).toContain('my_var');
  });

  Vitest.it('flags a variable that is both required and defaulted', () => {
    const result = Prompts.verifyPromptFile(
      'audit',
      promptFile({
        name: 'audit',
        template: 'Audit {{files}}',
        variables: [variableFile('files', { required: true, default: 'src/' })],
      }),
    );
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues[0]?.message).toContain('required but also has a default');
    Vitest.expect(result.issues[0]?.fix).toContain('"required": false');
  });

  Vitest.it('omits the expected list when the template itself is what is wrong', () => {
    const result = Prompts.verifyPromptFile(
      'audit',
      promptFile({ name: 'audit', template: 'Audit {{user.name}}' }),
    );
    Vitest.expect(result.expectedVariables).toBeUndefined();
  });
});

Vitest.describe('Prompts.verifyPromptFile template grammar', () => {
  Vitest.it('flags an unclosed block as a syntax error and skips the coverage checks', () => {
    const result = Prompts.verifyPromptFile(
      'audit',
      promptFile({ name: 'audit', template: '{{#if scope}}in {{scope}}' }),
    );
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues.length).toBe(1);
    Vitest.expect(result.issues[0]?.field).toBe('template');
    Vitest.expect(result.issues[0]?.message).toContain('not valid Handlebars');
  });

  Vitest.it('flags a disallowed block and suggests the allowed one', () => {
    const result = Prompts.verifyPromptFile(
      'audit',
      promptFile({ name: 'audit', template: '{{#each files}}{{this}}{{/each}}' }),
    );
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues[0]?.message).toBe('{{#each}} is not allowed.');
    Vitest.expect(result.issues[0]?.fix).toContain('{{#if');
  });

  Vitest.it('flags a helper call', () => {
    const result = Prompts.verifyPromptFile(
      'audit',
      promptFile({ name: 'audit', template: '{{upper files}}' }),
    );
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues[0]?.message).toContain('is a helper call');
  });

  Vitest.it('flags a dotted path and suggests the flat name', () => {
    const result = Prompts.verifyPromptFile(
      'audit',
      promptFile({ name: 'audit', template: 'Audit {{user.name}}' }),
    );
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues[0]?.message).toContain('dotted path');
    Vitest.expect(result.issues[0]?.fix).toContain('user_name');
  });

  Vitest.it('flags a data variable', () => {
    const result = Prompts.verifyPromptFile(
      'audit',
      promptFile({ name: 'audit', template: 'Row {{@index}}' }),
    );
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues[0]?.message).toContain('data variable');
  });

  Vitest.it('flags every template problem in one pass', () => {
    const result = Prompts.verifyPromptFile(
      'audit',
      promptFile({ name: 'audit', template: '{{a.b}} {{#each x}}{{/each}} {{@i}}' }),
    );
    Vitest.expect(result.issues.length).toBe(3);
    Vitest.expect(result.issues.every((found) => found.field === 'template')).toBe(true);
  });
});

Vitest.describe('Prompts.verifyReport', () => {
  Vitest.it('confirms a clean file in one line', () => {
    Vitest.expect(Prompts.verifyReport('commit', { valid: true, issues: [] })).toBe(
      "✓ 'commit' matches the standard format.",
    );
  });

  Vitest.it('numbers the issues and shows each Fix line', () => {
    const report = Prompts.verifyReport('audit', {
      valid: false,
      issues: [
        { field: 'template', message: 'Bad.', fix: 'Close the block.', line: 3 },
        { field: 'variables', message: 'Missing one.' },
      ],
    });
    Vitest.expect(report).toContain("'audit' has 2 issues");
    Vitest.expect(report).toContain('1. [template] Bad. (line 3)');
    Vitest.expect(report).toContain('   Fix: Close the block.');
    Vitest.expect(report).toContain('2. [variables] Missing one.');
  });

  Vitest.it('appends the expected variables JSON, once, when coverage is wrong', () => {
    const report = Prompts.verifyReport('audit', {
      valid: false,
      issues: [{ field: 'variables', message: 'Out of order.' }],
      expectedVariables: '[\n  { "name": "a", "required": true }\n]',
    });
    Vitest.expect(report).toContain('The template references these variables');
    Vitest.expect(report).toContain('  [');
    Vitest.expect(report).toContain('    { "name": "a", "required": true }');
  });
});

Vitest.describe('Prompts.verifyInfoLine', () => {
  Vitest.it('renders the verified check', () => {
    Vitest.expect(Prompts.verifyInfoLine({ valid: true, issues: [] })).toBe('✓ verified');
  });

  Vitest.it('renders the unverified cross with a plural count', () => {
    Vitest.expect(
      Prompts.verifyInfoLine({
        valid: false,
        issues: [
          { field: 'name', message: 'Missing.' },
          { field: 'template', message: 'Missing.' },
        ],
      }),
    ).toBe('✗ not verified — 2 issues');
  });

  Vitest.it('uses a singular count for one issue', () => {
    Vitest.expect(
      Prompts.verifyInfoLine({ valid: false, issues: [{ field: 'json', message: 'Bad.' }] }),
    ).toBe('✗ not verified — 1 issue');
  });
});
