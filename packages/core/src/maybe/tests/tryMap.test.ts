import * as Vitest from 'vitest';

import * as Maybe from '../index.js';

Vitest.describe('[runtime] Maybe.tryMap', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Maybe.tryMap).toBeDefined();
  });
});

Vitest.describe('[types] Maybe.tryMap', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Maybe.tryMap;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
