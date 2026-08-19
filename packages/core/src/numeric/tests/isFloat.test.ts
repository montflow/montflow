import * as Vitest from 'vitest';

import * as Numeric from '../index.js';

Vitest.describe('[runtime] Numeric.isFloat', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Numeric.isFloat).toBeDefined();
  });
});

Vitest.describe('[types] Numeric.isFloat', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Numeric.isFloat;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
