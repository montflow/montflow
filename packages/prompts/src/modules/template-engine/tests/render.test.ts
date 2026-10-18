import * as Vitest from '@effect/vitest';
import * as TemplateEngine from '../index.js';

/** The conditional prompt from the feature request, in both branch states. */
const CONDITIONAL =
  '{{#if scope}}Some text this is the scope: {{scope}}\n{{else}}Use the git to determine the unstaged changes that must be included.\n{{/if}}';

Vitest.describe('TemplateEngine.render', () => {
  Vitest.it('takes the then branch when the guarded value is present', () => {
    Vitest.expect(TemplateEngine.render(CONDITIONAL, { scope: 'src/' })).toBe(
      'Some text this is the scope: src/\n',
    );
  });

  Vitest.it('takes the else branch when the value is absent', () => {
    Vitest.expect(TemplateEngine.render(CONDITIONAL, {})).toBe(
      'Use the git to determine the unstaged changes that must be included.\n',
    );
  });

  Vitest.it('takes the else branch when the value is an empty string', () => {
    Vitest.expect(TemplateEngine.render(CONDITIONAL, { scope: '' })).toBe(
      'Use the git to determine the unstaged changes that must be included.\n',
    );
  });

  Vitest.it('chains else-if branches', () => {
    const tpl = '{{#if a}}A{{else if b}}B{{else}}C{{/if}}';
    Vitest.expect(TemplateEngine.render(tpl, { a: '1', b: '2' })).toBe('A');
    Vitest.expect(TemplateEngine.render(tpl, { b: '2' })).toBe('B');
    Vitest.expect(TemplateEngine.render(tpl, {})).toBe('C');
  });

  Vitest.it('renders unless as the inverse of if', () => {
    Vitest.expect(TemplateEngine.render('{{#unless skip}}kept{{/unless}}', {})).toBe('kept');
    Vitest.expect(TemplateEngine.render('{{#unless skip}}kept{{/unless}}', { skip: 'y' })).toBe('');
  });

  Vitest.it('does not HTML-escape — a prompt is text, not markup', () => {
    Vitest.expect(TemplateEngine.render('Run {{cmd}} with a && b', { cmd: 'x <y> & z' })).toBe(
      'Run x <y> & z with a && b',
    );
  });

  Vitest.it('honours whitespace control', () => {
    Vitest.expect(TemplateEngine.render('a\n{{~x~}}\nb', { x: 'X' })).toBe('aXb');
  });

  Vitest.it('drops comments', () => {
    Vitest.expect(TemplateEngine.render('a{{! hidden }}b', {})).toBe('ab');
  });

  Vitest.it('renders a reference inside an untaken branch without throwing', () => {
    // `strict` is off on purpose: `missing` is never in the context and the
    // branch never runs, so this must render instead of throwing.
    Vitest.expect(TemplateEngine.render('{{#if no}}{{missing}}{{else}}ok{{/if}}', {})).toBe('ok');
  });

  Vitest.it('renders an empty string for a prototype lookup', () => {
    Vitest.expect(TemplateEngine.render('[{{constructor}}]', {})).toBe('[]');
  });

  Vitest.it('throws a TemplateRenderError for a template that will not compile', () => {
    Vitest.expect(() => TemplateEngine.render('{{#if a}}unclosed', {})).toThrowError(
      TemplateEngine.TemplateRenderError,
    );
  });
});

Vitest.describe('TemplateEngine.buildContext', () => {
  Vitest.it('keys values by variable name so no branch can miss one', () => {
    Vitest.expect(
      TemplateEngine.buildContext([
        { name: 'scope', value: '' },
        { name: 'files', value: 'src/' },
      ]),
    ).toStrictEqual({ scope: '', files: 'src/' });
  });
});
