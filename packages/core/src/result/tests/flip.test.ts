import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[runtime] Result.flip', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.flip).toBeDefined();
  });

  Vitest.it("should convert 'Ok' to 'Err' carrying the value", () => {
    const flipped = Result.flip(Result.ok(1));

    if (Result.isErr(flipped)) {
      Vitest.expect(flipped.error).toBe(1);
    } else {
      Vitest.expect.unreachable('flip of Ok should be Err');
    }
  });

  Vitest.it("should convert 'Err' to 'Ok' carrying the error", () => {
    const flipped = Result.flip(Result.err('e'));

    if (Result.isOk(flipped)) {
      Vitest.expect(flipped.value).toBe('e');
    } else {
      Vitest.expect.unreachable('flip of Err should be Ok');
    }
  });
});

Vitest.describe('[types] Result.flip', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Result.flip;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should swap the value and error channels', () => {
    Vitest.expectTypeOf(Result.flip(Result.ok(1))).toEqualTypeOf<Result.Err<number>>();
    Vitest.expectTypeOf(Result.flip(Result.err('e'))).toEqualTypeOf<Result.Ok<string>>();
  });
});