import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[types] Result.Unknown', () => {
  Vitest.it('should be defined', () => {
    type Test = Result.Unknown;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
