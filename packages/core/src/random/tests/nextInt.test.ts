import { describe, expect, expectTypeOf, it } from "vitest";
import { nextInt } from "..";
import { Range } from "../../number";

describe("nextInt [runtime]", () => {
  it("should generate numbers in default range [0, 1] with default generator", () => {
    for (let _ = 0; _ < 999; _++) {
      const result = nextInt();
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    }
  });

  it("should generate numbers in specified range using array format", () => {
    const mockGenerator = () => 0.5;
    const range: Range = [10, 20];

    const result = nextInt({ generator: mockGenerator, range });
    expect(result).toBe(15);
  });

  it("should generate numbers in specified range using object format", () => {
    const mockGenerator = () => 0.5;
    const range = { min: 10, max: 20 };

    const result = nextInt({ generator: mockGenerator, range });

    expect(result).toBe(15);
  });

  it("should handle edge case with generator returning 0", () => {
    const mockGenerator = () => 0;
    const range: Range = [10, 20];

    const result = nextInt({ generator: mockGenerator, range });

    expect(result).toBe(10);
  });

  it("should handle edge case with generator returning 1", () => {
    const mockGenerator = () => 0.99999;
    const range: Range = [10, 20];

    const result = nextInt({ generator: mockGenerator, range });

    expect(result).toBe(20);
  });

  it("should work with negative ranges", () => {
    const mockGenerator = () => 0.5;
    const range: Range = [-20, -10];

    const result = nextInt({ generator: mockGenerator, range });

    expect(result).toBe(-15);
  });

  it("should throw error for invalid range where min > max", () => {
    const range: Range = [11, 10];

    expect(() => nextInt({ range })).toThrow("Invalid range: min must be less than max");
  });

  it("should handle partial options with only range", () => {
    const range: Range = [10, 20];
    for (let _ = 0; _ < 999; _++) {
      const result = nextInt({ range });

      expect(result).toBeGreaterThanOrEqual(10);
      expect(result).toBeLessThanOrEqual(20);
    }
  });

  it("should handle partial options with only generator", () => {
    const mockGenerator = () => 0.5;

    const result = nextInt({ generator: mockGenerator });

    expect(result).toBe(0);
  });

  it("should always return x when given range [x, x]", () => {
    const value = 42;
    const range: Range = [value, value];

    for (let _ = 0; _ < 999; _++) {
      const result = nextInt({ range });
      expect(result).toBe(value);
    }
  });
});

describe("nextInt [types]", () => {
  it("should return number type", () => {
    const result = nextInt();

    type Result = typeof result;
    type Expected = number;

    expectTypeOf<Result>().toMatchTypeOf<Expected>();
  });

  it("should accept partial options", () => {
    const withRange = nextInt({ range: [1, 10] });
    const withGenerator = nextInt({ generator: Math.random });

    type ResultWithRange = typeof withRange;
    type ResultWithGenerator = typeof withGenerator;
    type Expected = number;

    expectTypeOf<ResultWithRange>().toMatchTypeOf<Expected>();
    expectTypeOf<ResultWithGenerator>().toMatchTypeOf<Expected>();
  });
});

describe("nextInt.Options type", () => {
  it("should allow undefined options", () => {
    const options: nextInt.Options = {};
    expectTypeOf<typeof options>().toMatchTypeOf<nextInt.Options>();
  });

  it("should allow partial options", () => {
    const withRange: nextInt.Options = { range: [1, 10] };
    const withGenerator: nextInt.Options = { generator: Math.random };

    expectTypeOf<typeof withRange>().toMatchTypeOf<nextInt.Options>();
    expectTypeOf<typeof withGenerator>().toMatchTypeOf<nextInt.Options>();
  });

  it("should allow both range formats", () => {
    const withArrayRange: nextInt.Options = { range: [1, 10] };
    const withObjectRange: nextInt.Options = { range: { min: 1, max: 10 } };

    expectTypeOf<typeof withArrayRange>().toMatchTypeOf<nextInt.Options>();
    expectTypeOf<typeof withObjectRange>().toMatchTypeOf<nextInt.Options>();
  });
});
