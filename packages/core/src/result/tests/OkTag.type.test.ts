import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[types] Result.OkTag', () => {
  Vitest.it('should be defined', () => {
    type Test = Result.OkTag;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
