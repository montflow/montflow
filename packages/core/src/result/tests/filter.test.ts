import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[runtime] Result.filter', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.filter).toBeDefined();
  });
});

Vitest.describe('[types] Result.filter', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Result.filter;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
