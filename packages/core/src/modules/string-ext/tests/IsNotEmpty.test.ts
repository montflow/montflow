import * as Vitest from '@effect/vitest';

import * as StringExt from '../index.js';

Vitest.describe('StringExt.IsNotEmpty types', () => {
  Vitest.it('is false for the empty string', () => {
    Vitest.expectTypeOf<StringExt.IsNotEmpty<''>>().toEqualTypeOf<false>();
  });

  Vitest.it('is true for non-empty strings', () => {
    Vitest.expectTypeOf<StringExt.IsNotEmpty<'a'>>().toEqualTypeOf<true>();
    Vitest.expectTypeOf<StringExt.IsNotEmpty<' '>>().toEqualTypeOf<true>();
  });
});
