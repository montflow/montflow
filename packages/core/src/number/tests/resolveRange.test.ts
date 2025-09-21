import * as Vitest from "vitest";

import * as Number from "../index.js";

Vitest.describe("[runtime] Number.resolveRange", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Number.resolveRange).toBeDefined();
  });

  Vitest.it("should resolve array-style range", () => {
    const range: Number.Range = [1, 10];
    const expected = { min: 1, max: 10 };

    const result = Number.resolveRange(range);

    Vitest.expect(result).toEqual(expected);
  });

  Vitest.it("should pass through object-style range", () => {
    const range: Number.Range = { min: 1, max: 10 };
    const expected = { min: 1, max: 10 };

    const result = Number.resolveRange(range);

    Vitest.expect(result).toEqual(expected);
  });

  Vitest.it("should work with negative numbers", () => {
    const arrayRange: Number.Range = [-10, 5];
    const objectRange: Number.Range = { min: -10, max: 5 };

    const arrayResult = Number.resolveRange(arrayRange);
    const objectResult = Number.resolveRange(objectRange);

    Vitest.expect(arrayResult).toEqual(objectResult);
    Vitest.expect(arrayResult).toEqual({ min: -10, max: 5 });
  });

  Vitest.it("should work with floating point numbers", () => {
    const arrayRange: Number.Range = [1.5, 10.75];
    const objectRange: Number.Range = { min: 1.5, max: 10.75 };

    const arrayResult = Number.resolveRange(arrayRange);
    const objectResult = Number.resolveRange(objectRange);

    Vitest.expect(arrayResult).toEqual(objectResult);
    Vitest.expect(arrayResult).toEqual({ min: 1.5, max: 10.75 });
  });
});

Vitest.describe("[types] Number.resolveRange", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Number.resolveRange;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it("should return object type for array input", () => {
    const range: Number.Range = [1, 10];
    const result = Number.resolveRange(range);

    type Result = typeof result;
    type Expected = { min: number; max: number };

    Vitest.expectTypeOf<Result>().toMatchTypeOf<Expected>();
  });

  Vitest.it("should return object type for object input", () => {
    const range: Number.Range = { min: 1, max: 10 };
    const result = Number.resolveRange(range);

    type Result = typeof result;
    type Expected = { min: number; max: number };

    Vitest.expectTypeOf<Result>().toMatchTypeOf<Expected>();
  });
});

Vitest.describe("[types] Number.Range", () => {
  Vitest.it("should be defined", () => {
    type Test = Number.Range;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it("should allow array type assignment", () => {
    const range: Number.Range = [1, 10];
    Vitest.expectTypeOf<typeof range>().toMatchTypeOf<Number.Range>();
  });

  Vitest.it("should allow object type assignment", () => {
    const range: Number.Range = { min: 1, max: 10 };
    Vitest.expectTypeOf<typeof range>().toMatchTypeOf<Number.Range>();
  });
});
