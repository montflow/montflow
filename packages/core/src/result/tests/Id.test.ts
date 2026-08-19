import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[runtime] Result.Id', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.Id).toBeDefined();
  });
});

Vitest.describe('[types] Result.Id', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Result.Id;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
