import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[types] Result.Promise', () => {
  Vitest.it('should be defined', () => {
    type Test = Result.Promise<any, any>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
