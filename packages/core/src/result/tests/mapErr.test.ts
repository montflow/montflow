import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[runtime] Result.mapErr', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.mapErr).toBeDefined();
  });
});

Vitest.describe('[types] Result.mapErr', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Result.mapErr;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
