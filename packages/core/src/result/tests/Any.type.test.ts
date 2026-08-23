import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[types] Result.Any', () => {
  Vitest.it('should be defined', () => {
    type Test = Result.Any;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should equal Result<any, any>', () => {
    Vitest.expectTypeOf<Result.Any>().toEqualTypeOf<Result.Result<any, any>>();
  });
});