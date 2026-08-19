import * as Vitest from 'vitest';

import * as Maybe from '../index.js';

Vitest.describe('[runtime] Maybe.UnwrapError', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Maybe.UnwrapError).toBeDefined();
  });
});

Vitest.describe('[types] Maybe.UnwrapError', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Maybe.UnwrapError;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
