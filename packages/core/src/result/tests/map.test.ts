import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[runtime] Result.map', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.map).toBeDefined();
  });

  Vitest.it("should transform the value of an 'Ok'", () => {
    const result = Result.map(Result.ok(2), (value) => value * 2);

    Vitest.expect(Result.isOk(result)).toBe(true);
    Vitest.expect(Result.unwrap(result)).toBe(4);
  });

  Vitest.it("should return the 'Err' unchanged", () => {
    const self: Result.Result<number, string> = Result.err('e');

    const result = Result.map(self, (value) => value * 2);

    Vitest.expect(result).toBe(self);
  });

  Vitest.it('should support the curried form', () => {
    const result = Result.map((value: number) => value * 2)(Result.ok(2));

    Vitest.expect(Result.unwrap(result)).toBe(4);
  });
});

Vitest.describe('[types] Result.map', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Result.map;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should map the value channel and keep the error channel', () => {
    Vitest.expectTypeOf(
      Result.map(Result.ok(1), (value: number) => String(value)),
    ).toEqualTypeOf<Result.Result<string, never>>();
  });
});
