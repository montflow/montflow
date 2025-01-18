import { describe, expect, it } from "vitest";
import { isNotEmpty } from "..";

describe("isNonEmpty [runtime]", () => {
  it("should return true for non-empty arrays", () => {
    expect(isNotEmpty([1])).toBe(true);
    expect(isNotEmpty([1, 2, 3])).toBe(true);
    expect(isNotEmpty(["a"])).toBe(true);
    expect(isNotEmpty([null])).toBe(true);
    expect(isNotEmpty([undefined])).toBe(true);
  });

  it("should return false for empty arrays", () => {
    expect(isNotEmpty([])).toBe(false);
  });

  it("should work with arrays of different types", () => {
    const mixedArray = [1, "string", {}, [], true];
    expect(isNotEmpty(mixedArray)).toBe(true);
  });

  it("should return a curried function when called without arguments", () => {
    const isNonEmptyCurried = isNotEmpty();
    expect(isNonEmptyCurried).toBeInstanceOf(Function);

    expect(isNonEmptyCurried([1, 2, 3])).toBe(true);
    expect(isNonEmptyCurried([])).toBe(false);
  });

  it("should maintain type narrowing", () => {
    const array: number[] = [1, 2, 3];
    if (isNotEmpty(array)) {
      // TypeScript should recognize this as [number, ...number[]]
      const first: number = array[0]; // This should compile
      expect(first).toBe(1);
    }
  });
});
