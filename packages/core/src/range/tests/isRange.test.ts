import * as Vitest from 'vitest';

import * as Range from '../index.js';

Vitest.describe('[runtime] Range.isRange', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Range.isRange).toBeDefined();
  });
});

Vitest.describe('[types] Range.isRange', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Range.isRange;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
