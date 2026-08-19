import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[types] Result.InfiniteUnfold', () => {
  Vitest.it('should be defined', () => {
    type Test = Result.InfiniteUnfold<Result.Any>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
