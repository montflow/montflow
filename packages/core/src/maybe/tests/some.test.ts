import * as Vitest from 'vitest';

import * as Maybe from '../index.js';

Vitest.describe('[runtime] Maybe.some', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Maybe.some).toBeDefined();
  });
});

Vitest.describe('[types] Maybe.some', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Maybe.some;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});

Vitest.describe('[types] Maybe.Some', () => {
  Vitest.it('should be defined', () => {
    type Test = Maybe.Some<string>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
