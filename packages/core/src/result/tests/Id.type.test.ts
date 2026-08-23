import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[types] Result.Id', () => {
  Vitest.it('should be defined', () => {
    type Test = Result.Id;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should be the literal type "result"', () => {
    Vitest.expectTypeOf<Result.Id>().toEqualTypeOf<'result'>();
  });
});