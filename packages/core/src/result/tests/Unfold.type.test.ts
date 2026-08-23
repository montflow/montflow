import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[types] Result.Unfold', () => {
  Vitest.it('should be defined', () => {
    type Test = Result.Unfold<Result.Any>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should fully unfold nested Ok values', () => {
    Vitest.expectTypeOf<Result.Unfold<Result.Ok<Result.Ok<Result.Ok<number>>>>>().toEqualTypeOf<
      Result.Ok<number>
    >();
  });

  Vitest.it('should return a flat Ok unchanged', () => {
    Vitest.expectTypeOf<Result.Unfold<Result.Ok<number>>>().toEqualTypeOf<Result.Ok<number>>();
  });

  Vitest.it('should stop unfolding at Limit 0 and return the root', () => {
    Vitest.expectTypeOf<Result.Unfold<Result.Ok<Result.Ok<number>>, 0>>().toEqualTypeOf<
      Result.Ok<Result.Ok<number>>
    >();
  });

  Vitest.it('should union root and nested error channels within a shallow Limit', () => {
    Vitest.expectTypeOf<Result.Unfold<Result.Ok<Result.Err<string>>, 2>>().toEqualTypeOf<
      Result.Err<string>
    >();
  });
});