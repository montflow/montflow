import * as Vitest from 'vitest';

import * as Function from '../index.js';

Vitest.describe('[types] Function.Nullary.Any', () => {
  Vitest.it('should be defined', () => {
    type Test = Function.Nullary.Any;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
