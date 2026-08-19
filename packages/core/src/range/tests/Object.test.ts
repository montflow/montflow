import * as Vitest from 'vitest';

import * as Range from '../index.js';

Vitest.describe('[types] Range.Object', () => {
  Vitest.it('should be defined', () => {
    type Test = Range.Object;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
