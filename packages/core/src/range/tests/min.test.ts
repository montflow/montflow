import * as Vitest from 'vitest';

import * as Range from '../index.js';

Vitest.describe('[runtime] Range.min', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Range.min).toBeDefined();
  });
});

Vitest.describe('[types] Range.min', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Range.min;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
