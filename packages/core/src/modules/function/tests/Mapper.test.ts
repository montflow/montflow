import * as Vitest from 'vitest';

import * as Function from '../index.js';

Vitest.describe('[types] Function.Mapper', () => {
  Vitest.it('should be defined', () => {
    type Test = Function.Mapper<string, number>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
