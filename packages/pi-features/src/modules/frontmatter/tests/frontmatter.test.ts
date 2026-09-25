import * as Vitest from '@effect/vitest';
import * as Frontmatter from '../index.js';

const doc = [
  '---',
  'name: ship-feature',
  'tags:',
  '  - a',
  '  - b',
  'locked: A,B',
  '---',
  '',
  'Body.',
].join('\n');

Vitest.describe('Frontmatter.parseMarkdown runtime', () => {
  Vitest.it('parses scalars, lists, and the body', () => {
    const parsed = Frontmatter.parseMarkdown(doc);
    Vitest.expect(parsed?.fields['name']).toBe('ship-feature');
    Vitest.expect(parsed?.fields['tags']).toStrictEqual(['a', 'b']);
    Vitest.expect(parsed?.body.trim()).toBe('Body.');
  });

  Vitest.it('returns null without a frontmatter block', () => {
    Vitest.expect(Frontmatter.parseMarkdown('# No frontmatter\n')).toBeNull();
  });
});

Vitest.describe('Frontmatter.fieldList runtime', () => {
  Vitest.it('splits comma-separated scalars and filters blanks', () => {
    Vitest.expect(Frontmatter.fieldList({ locked: 'A,B' }, 'locked')).toStrictEqual(['A', 'B']);
    Vitest.expect(Frontmatter.fieldList({ locked: '' }, 'locked')).toStrictEqual([]);
    Vitest.expect(Frontmatter.fieldList({}, 'missing')).toStrictEqual([]);
  });

  Vitest.it('keeps YAML list items', () => {
    Vitest.expect(Frontmatter.fieldList({ tags: ['a', 'b'] }, 'tags')).toStrictEqual(['a', 'b']);
  });
});
