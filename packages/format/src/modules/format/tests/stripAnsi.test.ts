import * as Vitest from '@effect/vitest';

import * as Format from '../index.js';

Vitest.describe('Format.stripAnsi runtime', () => {
  Vitest.it('removes color and bold sequences', () => {
    const formatted = Format.make('hi').pipe(Format.bold, Format.color('red'), Format.compile);
    Vitest.expect(Format.stripAnsi(formatted)).toBe('hi');
  });

  Vitest.it('leaves plain text untouched', () => {
    Vitest.expect(Format.stripAnsi('just text')).toBe('just text');
  });

  Vitest.it('removes every sequence in one pass', () => {
    Vitest.expect(Format.stripAnsi('\x1b[31mred\x1b[0m and \x1b[1mbold\x1b[0m')).toBe(
      'red and bold',
    );
  });

  Vitest.it('handles empty text', () => {
    Vitest.expect(Format.stripAnsi('')).toBe('');
  });
});
