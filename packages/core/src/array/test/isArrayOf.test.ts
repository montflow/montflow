import { describe, expect, it } from "vitest";
import { isArrayOf } from "..";

// Helper guards for testing
const isNumber = (value: unknown): value is number => typeof value === "number";
const isString = (value: unknown): value is string => typeof value === "string";

describe("isArrayOf [runtime]", () => {
  it("should return true for arrays where all elements satisfy the guard", () => {
    expect(isArrayOf([1, 2, 3], isNumber)).toBe(true);
    expect(isArrayOf(["a", "b", "c"], isString)).toBe(true);
  });

  it("should return false for arrays where not all elements satisfy the guard", () => {
    expect(isArrayOf([1, "2", 3], isNumber)).toBe(false);
    expect(isArrayOf(["a", 42, "c"], isString)).toBe(false);
  });

  it("should return false for non-array inputs", () => {
    expect(isArrayOf(42, isNumber)).toBe(false);
    expect(isArrayOf("string", isString)).toBe(false);
    expect(isArrayOf({}, isNumber)).toBe(false);
    expect(isArrayOf(null, isString)).toBe(false);
  });

  it("should return a curried function when called with a guard", () => {
    const isArrayOfNumbers = isArrayOf(isNumber);
    expect(isArrayOfNumbers).toBeInstanceOf(Function);

    expect(isArrayOfNumbers([1, 2, 3])).toBe(true);
    expect(isArrayOfNumbers([1, "2", 3])).toBe(false);
    expect(isArrayOfNumbers("not an array")).toBe(false);
  });

  it("should work with nested arrays and guards", () => {
    const isNestedArrayOfNumbers = isArrayOf(isArrayOf(isNumber));
    expect(
      isNestedArrayOfNumbers([
        [1, 2],
        [3, 4],
      ])
    ).toBe(true);
    expect(
      isNestedArrayOfNumbers([
        [1, 2],
        ["3", 4],
      ])
    ).toBe(false);
  });
});
