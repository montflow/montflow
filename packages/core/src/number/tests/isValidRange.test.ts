import { describe, expect, expectTypeOf, it } from "vitest";
import { Range, isValidRange } from "..";

describe("isValidRange [runtime]", () => {
  it("should return true for valid tuple range", () => {
    const range: Range = [10, 15];
    const result = isValidRange(range);

    expect(result).toBe(true);
  });
  it("should return false for invalid tuple range", () => {
    const range: Range = [10, -15];
    const result = isValidRange(range);

    expect(result).toBe(false);
  });

  it("should return true for valid object range", () => {
    const range: Range = { min: 4, max: 42 };
    const result = isValidRange(range);

    expect(result).toBe(true);
  });

  it("should return false for invalid object range", () => {
    const range: Range = { min: 4, max: 2 };
    const result = isValidRange(range);

    expect(result).toBe(false);
  });

  it("should return true for range with same min and max", () => {
    const range: Range = { min: 2, max: 2 };
    const result = isValidRange(range);

    expect(result).toBe(true);
  });

  it("should return false for non-range values", () => {
    expect(isValidRange(null)).toBe(false);
    expect(isValidRange(undefined)).toBe(false);
    expect(isValidRange(42)).toBe(false);
    expect(isValidRange("string")).toBe(false);
    expect(isValidRange({})).toBe(false);
    expect(isValidRange([])).toBe(false);
    expect(isValidRange([1])).toBe(false);
    expect(isValidRange([1, 2, 3])).toBe(false);
    expect(isValidRange({ min: "1", max: 2 })).toBe(false);
    expect(isValidRange({ min: 1, max: "2" })).toBe(false);
    expect(isValidRange({ min: 1 })).toBe(false);
    expect(isValidRange({ max: 2 })).toBe(false);
    expect(isValidRange({ min: 1, max: 2, extra: 3 })).toBe(false);
  });
});

describe("isValidRange [types]", () => {
  it("should maintain type narrowing for tuple ranges", () => {
    const range = [1, 10] as unknown;

    if (isValidRange(range)) {
      type Test = typeof range;
      type Expect = Range;
      expectTypeOf<Test>().toMatchTypeOf<Expect>();
    }
  });

  it("should maintain type narrowing for object ranges", () => {
    const range = { min: 0, max: 100 } as unknown;

    if (isValidRange(range)) {
      type Test = typeof range;
      type Expect = Range;
      expectTypeOf<Test>().toMatchTypeOf<Expect>();
    }
  });
});
