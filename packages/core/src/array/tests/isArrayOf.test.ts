import * as Vitest from "vitest";

import * as Number from "../../number/index.js";
import * as String from "../../string/index.js";
import * as Array from "../index.js";

Vitest.describe("[runtime] Array.isArrayOf", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Array.isArrayOf).toBeDefined();
  });

  Vitest.it("should return true for arrays where all elements satisfy the guard", () => {
    Vitest.expect(Array.isArrayOf([1, 2, 3], Number.isNumber)).toBe(true);
    Vitest.expect(Array.isArrayOf(["a", "b", "c"], String.isString)).toBe(true);
  });

  Vitest.it("should return false for arrays where not all elements satisfy the guard", () => {
    Vitest.expect(Array.isArrayOf([1, "2", 3], Number.isNumber)).toBe(false);
    Vitest.expect(Array.isArrayOf(["a", 42, "c"], String.isString)).toBe(false);
  });

  Vitest.it("should return false for non-array inputs", () => {
    Vitest.expect(Array.isArrayOf(42, Number.isNumber)).toBe(false);
    Vitest.expect(Array.isArrayOf("string", String.isString)).toBe(false);
    Vitest.expect(Array.isArrayOf({}, Number.isNumber)).toBe(false);
    Vitest.expect(Array.isArrayOf(null, String.isString)).toBe(false);
  });

  Vitest.it("should return a curried function when called with a guard", () => {
    const isArrayOfNumbers = Array.isArrayOf(Number.isNumber);
    Vitest.expect(isArrayOfNumbers).toBeInstanceOf(Function);

    Vitest.expect(isArrayOfNumbers([1, 2, 3])).toBe(true);
    Vitest.expect(isArrayOfNumbers([1, "2", 3])).toBe(false);
    Vitest.expect(isArrayOfNumbers("not an array")).toBe(false);
  });

  Vitest.it("should work with nested arrays and guards", () => {
    const isNestedArrayOfNumbers = Array.isArrayOf(Array.isArrayOf(Number.isNumber));
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

Vitest.describe("[types] Array.isArrayOf", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Array.isArrayOf;

    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
