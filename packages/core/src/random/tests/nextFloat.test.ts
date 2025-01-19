import { describe, expect, expectTypeOf, it } from "vitest";
import { nextFloat } from "..";
import { Range } from "../../number";

describe("nextFloat [runtime]", () => {
  it("should generate numbers in default range [0, 1] with default generator", () => {
    const result = nextFloat();
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  it("should generate numbers in specified range using array format", () => {
    const mockGenerator = () => 0.5;
    const range: Range = [10, 20];

    const result = nextFloat({ generator: mockGenerator, range });

    expect(result).toBe(15);
  });

  it("should generate numbers in specified range using object format", () => {
    const mockGenerator = () => 0.25;
    const range: Range = { min: 0, max: 100 };

    const result = nextFloat({ generator: mockGenerator, range });

    expect(result).toBe(25);
  });

  it("should handle edge case with generator returning 0", () => {
    const mockGenerator = () => 0;
    const range: Range = [10, 20];

    const result = nextFloat({ generator: mockGenerator, range });

    expect(result).toBe(10);
  });

  it("should handle edge case with generator returning 1", () => {
    const mockGenerator = () => 1;
    const range: Range = [10, 20];

    const result = nextFloat({ generator: mockGenerator, range });

    expect(result).toBe(20);
  });

  it("should work with negative ranges", () => {
    const mockGenerator = () => 0.5;
    const range: Range = [-20, -10];

    const result = nextFloat({ generator: mockGenerator, range });

    expect(result).toBe(-15);
  });

  it("should work with fractional ranges", () => {
    const mockGenerator = () => 0.5;
    const range: Range = [1.5, 3.5];

    const result = nextFloat({ generator: mockGenerator, range });

    expect(result).toBe(2.5);
  });

  it("should throw error for invalid range where min >= max", () => {
    const range: Range = [10, 10];

    expect(() => nextFloat({ range })).toThrow("Invalid range: min must be less than max");
  });

  it("should handle very large ranges without overflow", () => {
    const mockGenerator = () => 0.5;
    const range: Range = [-1e10, 1e10];

    const result = nextFloat({ generator: mockGenerator, range });

    expect(result).toBe(0);
  });

  it("should handle partial options with only range", () => {
    const range: Range = [10, 20];
    const result = nextFloat({ range });

    expect(result).toBeGreaterThanOrEqual(10);
    expect(result).toBeLessThanOrEqual(20);
  });

  it("should handle partial options with only generator", () => {
    const mockGenerator = () => 0.5;

    const result = nextFloat({ generator: mockGenerator });

    expect(result).toBe(0.5);
  });
});

describe("nextFloat [types]", () => {
  it("should return number type", () => {
    const result = nextFloat();

    type Result = typeof result;
    type Expected = number;

    expectTypeOf<Result>().toMatchTypeOf<Expected>();
  });

  it("should accept partial options", () => {
    const range: Range = [1, 10];
    const withRange = nextFloat({ range });
    const withGenerator = nextFloat({ generator: Math.random });

    type ResultWithRange = typeof withRange;
    type ResultWithGenerator = typeof withGenerator;
    type Expected = number;

    expectTypeOf<ResultWithRange>().toMatchTypeOf<Expected>();
    expectTypeOf<ResultWithGenerator>().toMatchTypeOf<Expected>();
  });
});

describe("nextFloat.Options type", () => {
  it("should allow undefined options", () => {
    const options: nextFloat.Options = {};
    expectTypeOf<typeof options>().toMatchTypeOf<nextFloat.Options>();
  });

  it("should allow partial options", () => {
    const range: Range = [1, 10];
    const withRange: nextFloat.Options = { range };
    const withGenerator: nextFloat.Options = { generator: Math.random };

    expectTypeOf<typeof withRange>().toMatchTypeOf<nextFloat.Options>();
    expectTypeOf<typeof withGenerator>().toMatchTypeOf<nextFloat.Options>();
  });

  it("should allow both range formats", () => {
    const arrayRange: Range = [1, 10];
    const objectRange: Range = { min: 1, max: 10 };

    const withArrayRange: nextFloat.Options = { range: arrayRange };
    const withObjectRange: nextFloat.Options = { range: objectRange };

    expectTypeOf<typeof withArrayRange>().toMatchTypeOf<nextFloat.Options>();
    expectTypeOf<typeof withObjectRange>().toMatchTypeOf<nextFloat.Options>();
  });
});
