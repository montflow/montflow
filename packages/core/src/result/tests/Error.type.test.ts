import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[types] Result.Error', () => {
  Vitest.it('should be defined', () => {
    type Test = Result.Error<Result.Any>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
