import * as Vitest from 'vitest';

import * as Numeric from '../index.js';

Vitest.describe('[runtime] Numeric.isPositive', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Numeric.isPositive).toBeDefined();
  });
});

Vitest.describe('[types] Numeric.isPositive', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Numeric.isPositive;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
