import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[types] Result.InfiniteUnfold', () => {
  Vitest.it('should be defined', () => {
    type Test = Result.InfiniteUnfold<Result.Any>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should fully unfold nested Ok values', () => {
    Vitest.expectTypeOf<
      Result.InfiniteUnfold<Result.Ok<Result.Ok<Result.Ok<number>>>>
    >().toEqualTypeOf<Result.Ok<number>>();
  });

  Vitest.it('should return a flat Ok unchanged', () => {
    Vitest.expectTypeOf<Result.InfiniteUnfold<Result.Ok<number>>>().toEqualTypeOf<
      Result.Ok<number>
    >();
  });
});