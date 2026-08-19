import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[types] Result.Unfold', () => {
  Vitest.it('should be defined', () => {
    type Test = Result.Unfold<Result.Any>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
