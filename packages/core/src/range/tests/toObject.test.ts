import * as Vitest from 'vitest';

import * as Range from '../index.js';

Vitest.describe('[runtime] Range.toObject', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Range.toObject).toBeDefined();
  });
});

Vitest.describe('[types] Range.toObject', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Range.toObject;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
