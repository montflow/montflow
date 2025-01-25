import { describe, expect, expectTypeOf, it } from "vitest";
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
});

describe("isArray [runtime]", () => {
  it("should infer array item type if checking array", () => {
    const array = [1, 2, 3];

    if (isArray(array)) {
      type Test = typeof array;
      type Expected = Array<number>;
      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }
  });

  it("should infer array item type as unknown if thing is unknown", () => {
    const array: unknown = null;

    if (isArray(array)) {
      type Test = typeof array;
      type Expected = Array<unknown>;
      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }
  });
});
