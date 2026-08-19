import * as Vitest from 'vitest';

import * as Iterable from '../index.js';

Vitest.describe('[runtime] Iterable.isIterable', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Iterable.isIterable).toBeDefined();
  });
});

Vitest.describe('[types] Iterable.isIterable', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Iterable.isIterable;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
