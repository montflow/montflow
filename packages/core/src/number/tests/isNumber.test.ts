import { describe, expect, expectTypeOf, it } from "vitest";
import { isNumber } from "..";

describe("isNumber [runtime]", () => {
  it("should return true for valid numbers", () => {
    expect(isNumber(0)).toBe(true);
    expect(isNumber(42)).toBe(true);
    expect(isNumber(-1)).toBe(true);
    expect(isNumber(3.14)).toBe(true);
    expect(isNumber(Infinity)).toBe(true);
    expect(isNumber(-Infinity)).toBe(true);
  });

  it("should return false for NaN", () => {
    expect(isNumber(NaN)).toBe(false);
  });

  it("should return false for non-numbers", () => {
    expect(isNumber(null)).toBe(false);
    expect(isNumber(undefined)).toBe(false);
    expect(isNumber("42")).toBe(false);
    expect(isNumber([])).toBe(false);
    expect(isNumber({})).toBe(false);
    expect(isNumber(true)).toBe(false);
    expect(isNumber(BigInt(42))).toBe(false);
    expect(isNumber(Symbol())).toBe(false);
  });
});

describe("isNumber [types]", () => {
  it("should maintain type narrowing", () => {
    const value = 42 as unknown;

    if (isNumber(value)) {
      type Test = typeof value;
      type Expect = number;
      expectTypeOf<Test>().toMatchTypeOf<Expect>();
    }
  });
});
