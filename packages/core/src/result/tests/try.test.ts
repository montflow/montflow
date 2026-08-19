import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[runtime] Result.try', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.try).toBeDefined();
  });
});

Vitest.describe('[types] Result.try', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Result.try;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
