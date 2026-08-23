import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[runtime] Result.tap', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.tap).toBeDefined();
  });

  Vitest.it("should run the function with the 'Ok' value", () => {
    const seen: number[] = [];
    const self = Result.ok(1);

    const returned = Result.tap(self, (value) => seen.push(value));

    Vitest.expect(seen).toEqual([1]);
    Vitest.expect(returned).toBe(self);
  });

  Vitest.it("should skip the function for an 'Err'", () => {
    const seen: string[] = [];
    const self: Result.Result<number, string> = Result.err('e');

    const returned = Result.tap(self, (value) => seen.push(String(value)));

    Vitest.expect(seen).toEqual([]);
    Vitest.expect(returned).toBe(self);
  });

  Vitest.it('should support the curried form', () => {
    const seen: number[] = [];

    Result.tap((value: number) => seen.push(value))(Result.ok(2));

    Vitest.expect(seen).toEqual([2]);
  });
});

Vitest.describe('[types] Result.tap', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Result.tap;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should preserve the input Result type', () => {
    const self = Result.ok(1);
    Vitest.expectTypeOf(Result.tap(self, () => {})).toEqualTypeOf<Result.Ok<number>>();
  });
});
