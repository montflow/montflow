import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[runtime] Result.OkTag', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.OkTag).toBeDefined();
  });
});

Vitest.describe('[types] Result.OkTag', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Result.OkTag;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
