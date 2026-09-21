import * as Vitest from '@effect/vitest';

import * as StringExt from '../index.js';

Vitest.describe('StringExt.IsEmpty types', () => {
  Vitest.it('is true for the empty string', () => {
    Vitest.expectTypeOf<StringExt.IsEmpty<''>>().toEqualTypeOf<true>();
  });

  Vitest.it('is false for non-empty strings', () => {
    Vitest.expectTypeOf<StringExt.IsEmpty<'a'>>().toEqualTypeOf<false>();
    Vitest.expectTypeOf<StringExt.IsEmpty<' '>>().toEqualTypeOf<false>();
  });
});
