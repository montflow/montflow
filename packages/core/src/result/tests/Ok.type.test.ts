import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[types] Result.Ok', () => {
  Vitest.it('should be defined', () => {
    type Test = Result.Ok<any>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
