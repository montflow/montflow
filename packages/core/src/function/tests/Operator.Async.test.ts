import * as Vitest from 'vitest';

import * as Function from '../index.js';

Vitest.describe('[types] Function.Operator.Async', () => {
  Vitest.it('should be defined', () => {
    type Test = Function.Operator.Async<string, number>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
