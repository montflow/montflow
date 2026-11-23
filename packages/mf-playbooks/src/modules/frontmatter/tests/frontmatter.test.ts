import * as Vitest from '@effect/vitest';
import { fieldString, parseMarkdown } from '../index.js';

Vitest.describe('parseMarkdown', () => {
  Vitest.it('reads scalars, strips one layer of quotes, and keeps the body', () => {
    const parsed = parseMarkdown('---\nname: demo\ndescription: "Apply when x."\n---\n\n# Demo\n');
    Vitest.expect(parsed?.fields).toStrictEqual({ name: 'demo', description: 'Apply when x.' });
    Vitest.expect(parsed?.body).toBe('\n# Demo\n');
    Vitest.expect(parsed?.invalidLines).toStrictEqual([]);
  });

  Vitest.it('reads lists, including a blank key that carries only a comment', () => {
    const parsed = parseMarkdown(
      '---\nskills:   # optional\n  - one\n  # skipped\n  - two\nname: x\n---\n',
    );
    Vitest.expect(parsed?.fields).toStrictEqual({ skills: ['one', 'two'], name: 'x' });
  });

  Vitest.it('returns null without an opening or a closing delimiter', () => {
    Vitest.expect(parseMarkdown('# no frontmatter\n')).toBeNull();
    Vitest.expect(parseMarkdown('---\nname: x\n')).toBeNull();
  });

  Vitest.it('records the file line of every unreadable frontmatter line', () => {
    const parsed = parseMarkdown('---\nname: x\nnot a pair\n---\n');
    Vitest.expect(parsed?.invalidLines).toStrictEqual([3]);
  });

  Vitest.it('fieldString reads scalars only', () => {
    Vitest.expect(fieldString({ a: 'x', b: ['y'] }, 'a')).toBe('x');
    Vitest.expect(fieldString({ a: 'x', b: ['y'] }, 'b')).toBeUndefined();
    Vitest.expect(fieldString({}, 'c')).toBeUndefined();
  });
});
