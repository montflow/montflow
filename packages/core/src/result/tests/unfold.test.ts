import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[runtime] Result.unfold', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.unfold).toBeDefined();
  });
});

Vitest.describe('[types] Result.unfold', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Result.unfold;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
