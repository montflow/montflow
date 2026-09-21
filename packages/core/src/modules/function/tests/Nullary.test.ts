import * as Vitest from 'vitest';

import * as Function from '../index.js';

Vitest.describe('[types] Function.Nullary', () => {
  Vitest.it('should be defined', () => {
    type Test = Function.Nullary<number>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
