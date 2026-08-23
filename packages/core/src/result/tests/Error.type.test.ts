import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[types] Result.Error', () => {
  Vitest.it('should be defined', () => {
    type Test = Result.Error<Result.Any>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should extract the inner Err type', () => {
    Vitest.expectTypeOf<Result.Error<Result.Err<string>>>().toEqualTypeOf<string>();
  });

  Vitest.it("should be 'never' for an Ok", () => {
    Vitest.expectTypeOf<Result.Error<Result.Ok<number>>>().toEqualTypeOf<never>();
  });

  Vitest.it('should extract the error type of a Result union', () => {
    Vitest.expectTypeOf<Result.Error<Result.Result<number, string>>>().toEqualTypeOf<string>();
  });
});