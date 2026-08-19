import * as Vitest from 'vitest';

import * as Function from '../index.js';

Vitest.describe('[types] Function.Any', () => {
  Vitest.it('should be defined', () => {
    type Test = Function.Any;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
