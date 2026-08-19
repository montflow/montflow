import * as Vitest from 'vitest';

import * as Function from '../index.js';

Vitest.describe('[types] Function.Operator', () => {
  Vitest.it('should be defined', () => {
    type Test = Function.Operator<string, number>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
