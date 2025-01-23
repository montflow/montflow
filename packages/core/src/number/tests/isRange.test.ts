import { describe, expect, expectTypeOf, it } from "vitest";
import { Range, isRange } from "..";

describe("isRange [runtime]", () => {
  it("should return true for valid tuple range", () => {
    const range: Range = [10, 15];
    const result = isRange(range);

    expect(result).toBe(true);
  });
  it("should return true for invalid tuple range", () => {
    const range: Range = [10, -15];
    const result = isRange(range);

    expect(result).toBe(true);
  });

  it("should return true for valid object range", () => {
    const range: Range = { min: 4, max: 42 };
    const result = isRange(range);

    expect(result).toBe(true);
  });

  it("should return true for invalid object range", () => {
    const range: Range = { min: 4, max: 2 };
    const result = isRange(range);

    expect(result).toBe(true);
  });

  it("should return true for range with same min and max", () => {
    const range: Range = { min: 2, max: 2 };
    const result = isRange(range);

    expect(result).toBe(true);
  });

  it("should return false for non-range values", () => {
    expect(isRange(null)).toBe(false);
    expect(isRange(undefined)).toBe(false);
    expect(isRange(42)).toBe(false);
    expect(isRange("string")).toBe(false);
    expect(isRange({})).toBe(false);
    expect(isRange([])).toBe(false);
    expect(isRange([1])).toBe(false);
    expect(isRange([1, 2, 3])).toBe(false);
    expect(isRange({ min: "1", max: 2 })).toBe(false);
    expect(isRange({ min: 1, max: "2" })).toBe(false);
    expect(isRange({ min: 1 })).toBe(false);
    expect(isRange({ max: 2 })).toBe(false);
    expect(isRange({ min: 1, max: 2, extra: 3 })).toBe(false);
  });
});

describe("isRange [types]", () => {
  it("should maintain type narrowing for tuple ranges", () => {
    const range = [1, 10] as unknown;

    if (isRange(range)) {
      type Test = typeof range;
      type Expect = Range;
      expectTypeOf<Test>().toMatchTypeOf<Expect>();
    }
  });

  it("should maintain type narrowing for object ranges", () => {
    const range = { min: 0, max: 100 } as unknown;

    if (isRange(range)) {
      type Test = typeof range;
      type Expect = Range;
      expectTypeOf<Test>().toMatchTypeOf<Expect>();
    }
  });
});
