import * as Vitest from '@effect/vitest';

import * as StringExt from '../index.js';

Vitest.describe('StringExt.hasSpaces types', () => {
  Vitest.it('is true for strings containing a space', () => {
    Vitest.expectTypeOf<StringExt.HasSpaces<'a b'>>().toEqualTypeOf<true>();
    Vitest.expectTypeOf<StringExt.HasSpaces<' '>>().toEqualTypeOf<true>();
  });

  Vitest.it('is false for strings without a space', () => {
    Vitest.expectTypeOf<StringExt.HasSpaces<'ab'>>().toEqualTypeOf<false>();
    Vitest.expectTypeOf<StringExt.HasSpaces<''>>().toEqualTypeOf<false>();
  });
});

Vitest.describe('StringExt.hasSpaces runtime', () => {
  Vitest.it('returns true when the string contains a space', () => {
    Vitest.expect(StringExt.hasSpaces('a b')).toBe(true);
    Vitest.expect(StringExt.hasSpaces(' ')).toBe(true);
    Vitest.expect(StringExt.hasSpaces('hello world')).toBe(true);
  });

  Vitest.it('returns false when the string contains no space', () => {
    Vitest.expect(StringExt.hasSpaces('')).toBe(false);
    Vitest.expect(StringExt.hasSpaces('ab')).toBe(false);
    Vitest.expect(StringExt.hasSpaces('a\tb')).toBe(false);
    Vitest.expect(StringExt.hasSpaces('a\nb')).toBe(false);
  });
});
