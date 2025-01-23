import { describe, expect, it } from "vitest";
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

  it("should work with curried version", () => {
    const resolver = isValidRange();

    const range1: Range = [1, 10];
    const range2: Range = { min: -10, max: -400 };

    const result1 = resolver(range1);
    const result2 = resolver(range2);

    expect(result1).toBe(true);
    expect(result2).toBe(false);
  });
});
