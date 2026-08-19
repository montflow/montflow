import { test, expect } from 'vitest';
import { parseFrontmatter, skillsFromMarkdown, withSkills } from '../ui/src/lib/frontmatter';

test('skillsFromMarkdown: extracts the skills frontmatter list', () => {
  const markdown = [
    '---',
    'name: code-reviewer',
    'description: audits diffs',
    'skills:',
    '  - adversarial-review',
    '  - unit-testing',
    '---',
    '',
    '# Code Reviewer',
  ].join('\n');
  expect(skillsFromMarkdown(markdown)).toEqual(['adversarial-review', 'unit-testing']);
});

test('skillsFromMarkdown: returns [] without frontmatter or skills field', () => {
  expect(skillsFromMarkdown('# Plain\n\nbody')).toEqual([]);
  expect(skillsFromMarkdown('---\nname: x\n---\n')).toEqual([]);
});

test('parseFrontmatter: tolerates quoted scalars and blank lines', () => {
  const fm = parseFrontmatter('---\ndescription: "my agent"\n\nmodel: anthropic/claude\n---\nbody');
  expect(fm?.fields['description']).toBe('my agent');
  expect(fm?.fields['model']).toBe('anthropic/claude');
  expect(fm?.body).toBe('body');
});

test('withSkills: replaces an existing skills list and preserves other fields byte-for-byte', () => {
  const markdown = [
    '---',
    'name: code-reviewer',
    'description: audits diffs',
    'skills:',
    '  - adversarial-review',
    '  - unit-testing',
    'model: anthropic/claude',
    '---',
    '',
    '# Code Reviewer',
  ].join('\n');
  const updated = withSkills(markdown, ['adversarial-review', 'simplifying-code']);
  expect(updated).toBe(
    [
      '---',
      'name: code-reviewer',
      'description: audits diffs',
      'skills:',
      '  - adversarial-review',
      '  - simplifying-code',
      'model: anthropic/claude',
      '---',
      '',
      '# Code Reviewer',
    ].join('\n'),
  );
});

test('withSkills: empty list removes the skills block but keeps the rest', () => {
  const markdown = ['---', 'name: x', 'skills:', '  - old-skill', '---', 'body'].join('\n');
  expect(withSkills(markdown, [])).toBe(['---', 'name: x', '---', 'body'].join('\n'));
});

test('withSkills: prepends a minimal frontmatter when the document has none', () => {
  const markdown = '# Code Reviewer\n\n## Instructions\n\nbe strict';
  expect(withSkills(markdown, ['adversarial-review'])).toBe(
    '---\nskills:\n  - adversarial-review\n---\n\n# Code Reviewer\n\n## Instructions\n\nbe strict',
  );
});

test('withSkills: adding a second skill keeps the first', () => {
  const once = withSkills('# Title\n\nbody', ['adversarial-review']);
  const twice = withSkills(once, ['adversarial-review', 'unit-testing']);
  expect(skillsFromMarkdown(twice)).toEqual(['adversarial-review', 'unit-testing']);
});
