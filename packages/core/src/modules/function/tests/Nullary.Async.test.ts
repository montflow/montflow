import * as Vitest from 'vitest';

import * as Function from '../index.js';

Vitest.describe('[types] Function.Nullary.Async', () => {
  Vitest.it('should be defined', () => {
    type Test = Function.Nullary.Async<number>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
