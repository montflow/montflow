import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[types] Result.Result', () => {
  Vitest.it('should be defined', () => {
    type Test = Result.Result<string, number>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should be the union of Ok and Err', () => {
    type Test = Result.Result<string, number>;
    Vitest.expectTypeOf<Test>().toEqualTypeOf<Result.Ok<string> | Result.Err<number>>();
  });

  Vitit_placeholder: {
  }
});
