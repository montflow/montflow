import * as Vitest from '@effect/vitest';
import * as TemplateEngine from '../index.js';

Vitest.describe('TemplateEngine.inspect references', () => {
  Vitest.it('collects substitutions in first-appearance order, once each', () => {
    Vitest.expect(TemplateEngine.inspect('a {{x}} b {{y}} {{x}}').references).toStrictEqual([
      'x',
      'y',
    ]);
  });

  Vitest.it('separates guarded names from substituted ones', () => {
    const found = TemplateEngine.inspect('Some text this is the scope: {{scope}}');
    Vitest.expect(found.references).toStrictEqual(['scope']);
    Vitest.expect(found.conditionals).toStrictEqual([]);
  });

  Vitest.it('reads the guard of an if block as a conditional, not a reference', () => {
    const found = TemplateEngine.inspect(
      '{{#if scope}}Some text this is the scope: {{scope}}\n{{else}}Use git.{{/if}}',
    );
    Vitest.expect(found.references).toStrictEqual(['scope']);
    Vitest.expect(found.conditionals).toStrictEqual(['scope']);
    Vitest.expect(found.issues).toStrictEqual([]);
  });

  Vitest.it('reads unless guards and else-if chains', () => {
    const found = TemplateEngine.inspect(
      '{{#unless a}}A{{/unless}}{{#if b}}B{{else if c}}C{{/if}}',
    );
    Vitest.expect(found.conditionals).toStrictEqual(['a', 'b', 'c']);
  });

  Vitest.it('returns nothing for a template with no tokens', () => {
    Vitest.expect(TemplateEngine.inspect('no tokens here').references).toStrictEqual([]);
    Vitest.expect(TemplateEngine.inspect('').references).toStrictEqual([]);
  });

  Vitest.it('ignores comments', () => {
    const found = TemplateEngine.inspect('{{! mention {{x}} here }}{{y}}');
    Vitest.expect(found.references).toStrictEqual(['y']);
    Vitest.expect(found.issues).toStrictEqual([]);
  });
});

Vitest.describe('TemplateEngine.inspect issues', () => {
  Vitest.it('reports a syntax error without throwing', () => {
    const found = TemplateEngine.inspect('{{#if scope}}no close');
    Vitest.expect(found.references).toStrictEqual([]);
    Vitest.expect(found.issues.length).toBe(1);
    Vitest.expect(found.issues[0]?.kind).toBe('syntax');
    Vitest.expect(found.issues[0]?.message).toContain('not valid Handlebars');
  });

  Vitest.it('gives the reason, not just the line number Handlebars leads with', () => {
    const found = TemplateEngine.inspect('{{#if a}}unclosed');
    Vitest.expect(found.issues[0]?.message).toContain('expected');
    Vitest.expect(found.issues[0]?.message).not.toContain('Parse error on line');
    Vitest.expect(found.issues[0]?.fix).toContain('line 1');
  });

  Vitest.it('names the mismatched opener and closer', () => {
    const found = TemplateEngine.inspect('{{#each x}}{{/if}}');
    Vitest.expect(found.issues[0]?.message).toContain('{{#each}} is closed by {{/if}}');
  });

  Vitest.it('rejects a block outside the allowed set', () => {
    const found = TemplateEngine.inspect('{{#each items}}{{this}}{{/each}}');
    Vitest.expect(found.issues.length).toBe(1);
    Vitest.expect(found.issues[0]?.kind).toBe('disallowed-block');
    Vitest.expect(found.issues[0]?.fix).toContain('{{#if');
  });

  Vitest.it('does not read a rejected block’s body as prompt variables', () => {
    // `{{this}}` belongs to the `{{#each}}` that will not survive the fix, so
    // it must not turn up in the list the author is told to paste.
    const found = TemplateEngine.inspect('{{#each items}}{{this}}{{/each}}{{keep}}');
    Vitest.expect(found.issues.map((issue) => issue.kind)).toStrictEqual(['disallowed-block']);
    Vitest.expect(found.variables).toStrictEqual(['keep']);
  });

  Vitest.it('suggests a closing tag that matches the replacement', () => {
    const found = TemplateEngine.inspect('{{#each items}}{{/each}}');
    Vitest.expect(found.issues[0]?.fix).toContain('{{/if}}');
    Vitest.expect(found.issues[0]?.fix).not.toContain('{{/each}}');
  });

  Vitest.it('rejects a helper call and suggests inlining it', () => {
    const found = TemplateEngine.inspect('{{lookup a b}}');
    Vitest.expect(found.issues[0]?.kind).toBe('disallowed-param');
  });

  Vitest.it('rejects a subexpression inside a block', () => {
    const found = TemplateEngine.inspect('{{#if (eq a b)}}x{{/if}}');
    Vitest.expect(found.issues[0]?.kind).toBe('block-param-count');
  });

  Vitest.it('rejects a dotted path and offers an underscore rename', () => {
    const found = TemplateEngine.inspect('{{user.name}}');
    Vitest.expect(found.issues[0]?.kind).toBe('dotted-path');
    Vitest.expect(found.issues[0]?.fix).toContain('user_name');
  });

  Vitest.it('rejects a data variable', () => {
    const found = TemplateEngine.inspect('{{@index}}');
    Vitest.expect(found.issues[0]?.kind).toBe('data-variable');
  });

  Vitest.it('rejects a name that is not a legal flat segment', () => {
    const found = TemplateEngine.inspect('{{ my-var }}');
    Vitest.expect(found.issues[0]?.kind).toBe('invalid-name');
    Vitest.expect(found.issues[0]?.fix).toContain('my_var');
  });

  Vitest.it('accepts a name with inner whitespace around it', () => {
    const found = TemplateEngine.inspect('{{ x }} then {{x}}');
    Vitest.expect(found.references).toStrictEqual(['x']);
    Vitest.expect(found.issues).toStrictEqual([]);
  });

  Vitest.it('reports every problem in one pass, not just the first', () => {
    const found = TemplateEngine.inspect('{{a.b}} {{#each x}}{{/each}} {{@i}}');
    Vitest.expect(found.issues.map((issue) => issue.kind)).toStrictEqual([
      'dotted-path',
      'disallowed-block',
      'data-variable',
    ]);
  });
});

Vitest.describe('TemplateEngine.isValidVariableName', () => {
  Vitest.it('accepts flat identifier segments only', () => {
    for (const name of ['scope', 'myVar', '_x', 'a1']) {
      Vitest.expect(TemplateEngine.isValidVariableName(name)).toBe(true);
    }
    for (const name of ['my-var', 'a.b', '1a', '', '@index']) {
      Vitest.expect(TemplateEngine.isValidVariableName(name)).toBe(false);
    }
  });
});

Vitest.describe('TemplateEngine.formatIssues', () => {
  Vitest.it('renders a Fix line per issue and locates it when known', () => {
    const text = TemplateEngine.formatIssues([
      { kind: 'syntax', message: 'Bad.', line: 3, fix: 'Close the block.' },
    ]);
    Vitest.expect(text).toBe('- Bad. (line 3)\n  Fix: Close the block.');
  });
});
