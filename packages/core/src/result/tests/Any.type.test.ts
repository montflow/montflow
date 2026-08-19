import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[types] Result.Any', () => {
  Vitest.it('should be defined', () => {
    type Test = Result.Any;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
