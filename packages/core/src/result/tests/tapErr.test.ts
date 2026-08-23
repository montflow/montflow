import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[runtime] Result.tapErr', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.tapErr).toBeDefined();
  });

  Vitest.it("should run the function with the 'Err' error", () => {
    const seen: string[] = [];
    const self = Result.err('e');

    const returned = Result.tapErr(self, (error) => seen.push(error));

    Vitest.expect(seen).toEqual(['e']);
    Vitest.expect(returned).toBe(self);
  });

  Vitest.it("should skip the function for an 'Ok'", () => {
    const seen: number[] = [];
    const self: Result.Result<number, string> = Result.ok(1);

    const returned = Result.tapErr(self, (error) => seen.push(error.length));

    Vitest.expect(seen).toEqual([]);
    Vitest.expect(returned).toBe(self);
  });

  Vitest.it('should support the curried form', () => {
    const seen: string[] = [];

    Result.tapErr((error: string) => seen.push(error))(Result.err('e'));

    Vitest.expect(seen).toEqual(['e']);
  });
});

Vitest.describe('[types] Result.tapErr', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Result.tapErr;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should preserve the input Result type', () => {
    const self = Result.err('e');
    Vitest.expectTypeOf(Result.tapErr(self, () => {})).toEqualTypeOf<Result.Err<string>>();
  });
});
