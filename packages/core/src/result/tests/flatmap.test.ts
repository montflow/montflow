import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[runtime] Result.flatmap', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.flatmap).toBeDefined();
  });

  Vitest.it("should map and flatten: 'Ok' + mapper returning 'Ok'", () => {
    const result = Result.flatmap(Result.ok(2), (value) => Result.ok(value * 2));

    Vitest.expect(Result.isOk(result)).toBe(true);
    Vitest.expect(Result.unwrap(result)).toBe(4);
  });

  Vitest.it("should propagate an 'Err' returned by the mapper", () => {
    const result = Result.flatmap(Result.ok(2), () => Result.err('mapped'));

    if (Result.isErr(result)) {
      Vitest.expect(result.error).toBe('mapped');
    } else {
      Vitest.expect.unreachable('mapper result Err should be preserved');
    }
  });

  Vitest.it("should return the 'Err' unchanged", () => {
    const self: Result.Result<number, string> = Result.err('e');

    const result = Result.flatmap(self, (value) => Result.ok(value * 2));

    Vitest.expect(result).toBe(self);
  });

  Vitest.it('should support the curried form', () => {
    const result = Result.flatmap((value: number) => Result.ok(value + 1))(Result.ok(1));

    Vitest.expect(Result.unwrap(result)).toBe(2);
  });
});

Vitest.describe('[types] Result.flatmap', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Result.flatmap;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should union the source and mapped error channels', () => {
    Vitest.expectTypeOf(
      Result.flatmap(Result.ok(1), (value: number) => Result.err(value > 0 ? 'big' : 0)),
    ).toEqualTypeOf<Result.Result<never, string | number>>();
  });
});