import * as Vitest from 'vitest';

import * as Function from '../index.js';

Vitest.describe('[types] Function.Unary', () => {
  Vitest.it('should be defined', () => {
    type Test = Function.Unary<string, number>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
