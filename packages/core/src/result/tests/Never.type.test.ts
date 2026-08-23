import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[types] Result.Never', () => {
  Vitest.it('should be defined', () => {
    type Test = Result.Never;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should equal Result<never, never>', () => {
    Vitest.expectTypeOf<Result.Never>().toEqualTypeOf<Result.Result<never, never>>();
  });
});