import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[runtime] Result.ok', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.ok).toBeDefined();
  });
});

Vitest.describe('[types] Result.ok', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Result.ok;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
