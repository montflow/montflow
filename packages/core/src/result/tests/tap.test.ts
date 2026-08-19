import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[runtime] Result.tap', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.tap).toBeDefined();
  });
});

Vitest.describe('[types] Result.tap', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Result.tap;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
