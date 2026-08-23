import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[types] Result.Unknown', () => {
  Vitest.it('should be defined', () => {
    type Test = Result.Unknown;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should equal Result<unknown, unknown>', () => {
    Vitest.expectTypeOf<Result.Unknown>().toEqualTypeOf<Result.Result<unknown, unknown>>();
  });
});