import * as Vitest from 'vitest';

import type * as Maybe from '../index.js';

Vitest.describe('[types] Maybe.InfiniteUnfold', () => {
  Vitest.it('should be defined', () => {
    type Test = Maybe.InfiniteUnfold<Maybe.Maybe<Maybe.Maybe<number>>>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
