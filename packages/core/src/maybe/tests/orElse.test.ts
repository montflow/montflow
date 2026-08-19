import * as Vitest from 'vitest';

import * as Maybe from '../index.js';

Vitest.describe('[runtime] Maybe.orElse', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Maybe.orElse).toBeDefined();
  });
});

Vitest.describe('[types] Maybe.orElse', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Maybe.orElse;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
