import { describe, expect, it } from "vitest";
import { isArray } from "..";

describe("isArray [runtime]", () => {
  it("should return true for arrays", () => {
    expect(isArray([])).toBe(true);
    expect(isArray([1, 2, 3])).toBe(true);
    expect(isArray(["a", "b", "c"])).toBe(true);
  });

  it("should return false for non-array values", () => {
    expect(isArray(null)).toBe(false);
    expect(isArray(undefined)).toBe(false);
    expect(isArray({})).toBe(false);
    expect(isArray(42)).toBe(false);
    expect(isArray("string")).toBe(false);
  });

  it("should return a curried function when called without arguments", () => {
    const isArrayCurried = isArray();
    expect(isArrayCurried).toBeInstanceOf(Function);
    expect(isArrayCurried([])).toBe(true);
    expect(isArrayCurried({})).toBe(false);
  });
});
