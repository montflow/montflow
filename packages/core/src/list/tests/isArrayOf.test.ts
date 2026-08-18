import * as Vitest from "vitest";

import * as Numeric from "../../numeric/index.js";
import * as Text from "../../text/index.js";
import * as List from "../index.js";

Vitest.describe("[runtime] List.isArrayOf", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(List.isArrayOf).toBeDefined();
  });

  Vitest.it(
    "should return true for arrays where all elements satisfy the guard",
    () => {
      Vitest.expect(List.isArrayOf([1, 2, 3], Numeric.isNumber)).toBe(true);
      Vitest.expect(List.isArrayOf(["a", "b", "c"], Text.isString)).toBe(true);
    }
  );

  Vitest.it(
    "should return false for arrays where not all elements satisfy the guard",
    () => {
      Vitest.expect(List.isArrayOf([1, "2", 3], Numeric.isNumber)).toBe(false);
      Vitest.expect(List.isArrayOf(["a", 42, "c"], Text.isString)).toBe(false);
    }
  );

  Vitest.it("should return false for non-array inputs", () => {
    Vitest.expect(List.isArrayOf(42, Numeric.isNumber)).toBe(false);
    Vitest.expect(List.isArrayOf("string", Text.isString)).toBe(false);
    Vitest.expect(List.isArrayOf({}, Numeric.isNumber)).toBe(false);
    Vitest.expect(List.isArrayOf(null, Text.isString)).toBe(false);
  });

  Vitest.it("should return a curried function when called with a guard", () => {
    const isArrayOfNumbers = List.isArrayOf(Numeric.isNumber);
    Vitest.expect(isArrayOfNumbers).toBeInstanceOf(Function);

    Vitest.expect(isArrayOfNumbers([1, 2, 3])).toBe(true);
    Vitest.expect(isArrayOfNumbers([1, "2", 3])).toBe(false);
    Vitest.expect(isArrayOfNumbers("not an array")).toBe(false);
  });

  Vitest.it("should work with nested arrays and guards", () => {
    const isNestedArrayOfNumbers = List.isArrayOf(
      List.isArrayOf(Numeric.isNumber)
    );
    Vitest.expect(
      isNestedArrayOfNumbers([
        [1, 2],
        [3, 4],
      ])
    ).toBe(true);
    Vitest.expect(
      isNestedArrayOfNumbers([
        [1, 2],
        ["3", 4],
      ])
    ).toBe(false);
  });
});

Vitest.describe("[types] List.isArrayOf", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof List.isArrayOf;

    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
