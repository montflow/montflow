import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[types] Result.Flatten', () => {
  Vitest.it('should be defined', () => {
    type Test = Result.Flatten<Result.Any>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should peel exactly one Ok level', () => {
    Vitest.expectTypeOf<Result.Flatten<Result.Ok<Result.Ok<number>>>>().toEqualTypeOf<
      Result.Ok<number>
    >();
  });

  Vitest.it('should return a non-nested Root unchanged', () => {
    Vitest.expectTypeOf<Result.Flatten<Result.Ok<number>>>().toEqualTypeOf<Result.Ok<number>>();
    Vitest.expectTypeOf<Result.Flatten<Result.Err<string>>>().toEqualTypeOf<Result.Err<string>>();
  });

  Vitest.it('should extract the nested Err channel from Ok(Err(...))', () => {
    Vitest.expectTypeOf<Result.Flatten<Result.Ok<Result.Err<string>>>>().toEqualTypeOf<
      Result.Err<string>
    >();
  });
});