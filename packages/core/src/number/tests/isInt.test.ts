import { describe, expect, expectTypeOf, it } from "vitest";
import { isInt } from "..";

describe("isInt [runtime]", () => {
  it("should return true for integers", () => {
    expect(isInt(0)).toBe(true);
    expect(isInt(42)).toBe(true);
    expect(isInt(-1)).toBe(true);
    expect(isInt(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(isInt(Number.MIN_SAFE_INTEGER)).toBe(true);
  });

  it("should return false for non-integer numbers", () => {
    expect(isInt(3.14)).toBe(false);
    expect(isInt(0.1)).toBe(false);
    expect(isInt(-2.5)).toBe(false);
    expect(isInt(Infinity)).toBe(false);
    expect(isInt(-Infinity)).toBe(false);
    expect(isInt(NaN)).toBe(false);
  });

  it("should return false for non-numbers", () => {
    expect(isInt(null)).toBe(false);
    expect(isInt(undefined)).toBe(false);
    expect(isInt("42")).toBe(false);
    expect(isInt([])).toBe(false);
    expect(isInt({})).toBe(false);
    expect(isInt(true)).toBe(false);
    expect(isInt(BigInt(42))).toBe(false);
  });
});

describe("isInt [types]", () => {
  it("should maintain type narrowing", () => {
    const value = 42 as unknown;

    if (isInt(value)) {
      type Test = typeof value;
      type Expect = number;
      expectTypeOf<Test>().toMatchTypeOf<Expect>();
    }
  });
});
