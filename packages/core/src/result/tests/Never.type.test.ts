import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[types] Result.Never', () => {
  Vitest.it('should be defined', () => {
    type Test = Result.Never;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
