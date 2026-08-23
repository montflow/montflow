import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[types] Result.Value', () => {
  Vitest.it('should be defined', () => {
    type Test = Result.Value<Result.Any>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should extract the inner Ok value type', () => {
    Vitest.expectTypeOf<Result.Value<Result.Ok<number>>>().toEqualTypeOf<number>();
  });

  Vitest.it("should be 'never' for an Err", () => {
    Vitest.expectTypeOf<Result.Value<Result.Err<string>>>().toEqualTypeOf<never>();
  });

  Vitest.it('should extract the value type of a Result union', () => {
    Vitest.expectTypeOf<Result.Value<Result.Result<number, string>>>().toEqualTypeOf<number>();
  });
});