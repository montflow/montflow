import { describe, expect, expectTypeOf, it } from "vitest";
import { Range, resolveRange } from "..";

describe("resolveRange [runtime]", () => {
  it("should resolve array-style range", () => {
    const range: Range = [1, 10];
    const expected = { min: 1, max: 10 };

    const result = resolveRange(range);

    expect(result).toEqual(expected);
  });

  it("should pass through object-style range", () => {
    const range: Range = { min: 1, max: 10 };
    const expected = { min: 1, max: 10 };

    const result = resolveRange(range);

    expect(result).toEqual(expected);
  });

  it("should work with negative numbers", () => {
    const arrayRange: Range = [-10, 5];
    const objectRange: Range = { min: -10, max: 5 };

    const arrayResult = resolveRange(arrayRange);
    const objectResult = resolveRange(objectRange);

    expect(arrayResult).toEqual(objectResult);
    expect(arrayResult).toEqual({ min: -10, max: 5 });
  });

  it("should work with floating point numbers", () => {
    const arrayRange: Range = [1.5, 10.75];
    const objectRange: Range = { min: 1.5, max: 10.75 };

    const arrayResult = resolveRange(arrayRange);
    const objectResult = resolveRange(objectRange);

    expect(arrayResult).toEqual(objectResult);
    expect(arrayResult).toEqual({ min: 1.5, max: 10.75 });
  });

  it("should work with curried version", () => {
    const range: Range = [1, 10];
    const expected = { min: 1, max: 10 };

    const resolver = resolveRange();
    const result = resolver(range);

    expect(result).toEqual(expected);
  });
});

describe("resolveRange [types]", () => {
  it("should return object type for array input", () => {
    const range: Range = [1, 10];
    const result = resolveRange(range);

    type Result = typeof result;
    type Expected = { min: number; max: number };

    expectTypeOf<Result>().toMatchTypeOf<Expected>();
  });

  it("should return object type for object input", () => {
    const range: Range = { min: 1, max: 10 };
    const result = resolveRange(range);

    type Result = typeof result;
    type Expected = { min: number; max: number };

    expectTypeOf<Result>().toMatchTypeOf<Expected>();
  });

  it("should maintain correct types in curried version", () => {
    const resolver = resolveRange();
    const result = resolver([1, 10]);

    type Resolver = typeof resolver;
    type Result = typeof result;

    type ExpectedResolver = (range: Range) => { min: number; max: number };
    type ExpectedResult = { min: number; max: number };

    expectTypeOf<Resolver>().toMatchTypeOf<ExpectedResolver>();
    expectTypeOf<Result>().toMatchTypeOf<ExpectedResult>();
  });
});

describe("Range type", () => {
  it("should allow array type assignment", () => {
    const range: Range = [1, 10];
    expectTypeOf<typeof range>().toMatchTypeOf<Range>();
  });

  it("should allow object type assignment", () => {
    const range: Range = { min: 1, max: 10 };
    expectTypeOf<typeof range>().toMatchTypeOf<Range>();
  });
});
