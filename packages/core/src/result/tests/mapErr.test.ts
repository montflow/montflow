import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[runtime] Result.mapErr', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.mapErr).toBeDefined();
  });

  Vitest.it("should transform the error of an 'Err'", () => {
    const result = Result.mapErr(Result.err('boom'), (error) => error.length);

    Vitest.expect(Result.isErr(result)).toBe(true);
    Vitest.expect(Result.unwrap(Result.flip(result))).toBe(4);
  });

  Vitest.it("should return the 'Ok' unchanged", () => {
    const self: Result.Result<number, string> = Result.ok(1);

    const result = Result.mapErr(self, (error) => error.length);

    Vitest.expect(result).toBe(self);
  });

  Vitest.it('should support the curried form', () => {
    const result = Result.mapErr((error: string) => error.length)(Result.err('boom'));

    Vitest.expect(Result.unwrap(Result.flip(result))).toBe(4);
  });
});

Vitest.describe('[types] Result.mapErr', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Result.mapErr;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should map the error channel and keep the value channel', () => {
    Vitest.expectTypeOf(
      Result.mapErr(Result.err('e'), (error: string) => error.length),
    ).toEqualTypeOf<Result.Result<never, number>>();
  });
});
