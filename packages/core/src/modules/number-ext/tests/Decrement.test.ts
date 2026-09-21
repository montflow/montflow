import * as Vitest from '@effect/vitest';

import * as NumberExt from '../index.js';

Vitest.describe('NumberExt.Decrement types', () => {
  Vitest.it('decrements numeric literals', () => {
    Vitest.expectTypeOf<NumberExt.Decrement<1>>().toEqualTypeOf<0>();
    Vitest.expectTypeOf<NumberExt.Decrement<5>>().toEqualTypeOf<4>();
    Vitest.expectTypeOf<NumberExt.Decrement<1024>>().toEqualTypeOf<1023>();
  });

  Vitest.it('decrements a generic numeric literal', () => {
    Vitest.expectTypeOf<NumberExt.Decrement<42>>().toEqualTypeOf<41>();
  });
});
