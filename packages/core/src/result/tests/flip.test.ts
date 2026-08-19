import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[runtime] Result.flip', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.flip).toBeDefined();
  });
});

Vitest.describe('[types] Result.flip', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Result.flip;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
