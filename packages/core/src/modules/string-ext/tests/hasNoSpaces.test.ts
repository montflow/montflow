import * as Vitest from '@effect/vitest';

import * as StringExt from '../index.js';

Vitest.describe('StringExt.hasNoSpaces runtime', () => {
  Vitest.it('returns true when the string contains no space', () => {
    Vitest.expect(StringExt.hasNoSpaces('')).toBe(true);
    Vitest.expect(StringExt.hasNoSpaces('ab')).toBe(true);
    Vitest.expect(StringExt.hasNoSpaces('a\tb')).toBe(true);
  });

  Vitest.it('returns false when the string contains a space', () => {
    Vitest.expect(StringExt.hasNoSpaces('a b')).toBe(false);
    Vitest.expect(StringExt.hasNoSpaces(' ')).toBe(false);
    Vitest.expect(StringExt.hasNoSpaces('hello world')).toBe(false);
  });
});
