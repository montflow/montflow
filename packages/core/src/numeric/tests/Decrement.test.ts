import * as Vitest from 'vitest';

import * as Numeric from '../index.js';

Vitest.describe('[types] Numeric.Decrement', () => {
  Vitest.it('should be defined', () => {
    type Test = Numeric.Decrement<5>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
