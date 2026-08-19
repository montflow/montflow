import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[runtime] Result.isResult', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.isResult).toBeDefined();
  });
});

Vitest.describe('[types] Result.isResult', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Result.isResult;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
