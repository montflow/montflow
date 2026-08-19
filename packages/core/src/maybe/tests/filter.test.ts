import * as Vitest from 'vitest';

import * as Maybe from '../index.js';

Vitest.describe('[runtime] Maybe.filter', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Maybe.filter).toBeDefined();
  });
});

Vitest.describe('[types] Maybe.filter', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Maybe.filter;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
