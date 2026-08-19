import * as Vitest from 'vitest';

import * as Maybe from '../index.js';

Vitest.describe('[runtime] Maybe.flatmap', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Maybe.flatmap).toBeDefined();
  });
});

Vitest.describe('[types] Maybe.flatmap', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Maybe.flatmap;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
