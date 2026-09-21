import * as Vitest from 'vitest';

import * as Range from '../index.js';

Vitest.describe('[types] Range.Range', () => {
  Vitest.it('should be defined', () => {
    type Test = Range.Range;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
