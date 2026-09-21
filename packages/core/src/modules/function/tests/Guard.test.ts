import * as Vitest from 'vitest';

import * as Function from '../index.js';

Vitest.describe('[types] Function.Guard', () => {
  Vitest.it('should be defined', () => {
    type Test = Function.Guard<string>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
