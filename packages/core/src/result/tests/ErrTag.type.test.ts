import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[types] Result.ErrTag', () => {
  Vitest.it('should be defined', () => {
    type Test = Result.ErrTag;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should be the literal type "err"', () => {
    Vitest.expectTypeOf<Result.ErrTag>().toEqualTypeOf<'err'>();
  });
});