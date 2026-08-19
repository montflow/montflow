import * as Vitest from 'vitest';

import * as Maybe from '../index.js';

Vitest.describe('[runtime] Maybe.none', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Maybe.none).toBeDefined();
  });
});

Vitest.describe('[types] Maybe.none', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Maybe.none;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});

Vitest.describe('[types] Maybe.None', () => {
  Vitest.it('should be defined', () => {
    type Test = Maybe.None;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
