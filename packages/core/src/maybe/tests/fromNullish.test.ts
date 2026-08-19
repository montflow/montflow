import * as Vitest from 'vitest';

import * as Maybe from '../index.js';

Vitest.describe('[runtime] Maybe.fromNullish', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Maybe.fromNullish).toBeDefined();
  });
});

Vitest.describe('[types] Maybe.fromNullish', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Maybe.fromNullish;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
