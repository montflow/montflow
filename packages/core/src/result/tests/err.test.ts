import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[runtime] Result.err', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.err).toBeDefined();
  });
});

Vitest.describe('[types] Result.err', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Result.err;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
