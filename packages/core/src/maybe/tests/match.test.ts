import * as Vitest from 'vitest';

import * as Maybe from '../index.js';

Vitest.describe('[runtime] Maybe.match', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Maybe.match).toBeDefined();
  });
});

Vitest.describe('[types] Maybe.match', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Maybe.match;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
