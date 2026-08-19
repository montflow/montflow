import * as Vitest from 'vitest';

import * as Maybe from '../index.js';

Vitest.describe('[runtime] Maybe.try', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Maybe.try).toBeDefined();
  });
});

Vitest.describe('[types] Maybe.try', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Maybe.try;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
