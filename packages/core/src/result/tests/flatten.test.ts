import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[runtime] Result.flatten', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.flatten).toBeDefined();
  });
});

Vitest.describe('[types] Result.flatten', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Result.flatten;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
