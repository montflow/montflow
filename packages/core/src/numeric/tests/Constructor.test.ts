import * as Vitest from 'vitest';

import * as Numeric from '../index.js';

Vitest.describe('[runtime] Numeric.Constructor', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Numeric.Constructor).toBeDefined();
  });
});

Vitest.describe('[types] Numeric.Constructor', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Numeric.Constructor;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
