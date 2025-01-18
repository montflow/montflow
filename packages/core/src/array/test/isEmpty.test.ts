import { describe, expect, expectTypeOf, it } from "vitest";
import { isEmpty } from "..";

describe("isEmpty [runtime]", () => {
  it("should return true for empty arrays", () => {
    expect(isEmpty([])).toBe(true);
  });

  it("should return false for non-empty arrays", () => {
    expect(isEmpty([1])).toBe(false);
    expect(isEmpty([1, 2, 3])).toBe(false);
    expect(isEmpty(["a"])).toBe(false);
    expect(isEmpty([null])).toBe(false);
    expect(isEmpty([undefined])).toBe(false);
  });

  it("should work with arrays of different types", () => {
    const mixedArray = [1, "string", {}, [], true];
    expect(isEmpty(mixedArray)).toBe(false);
    expect(isEmpty([])).toBe(true);
  });

  it("should return a curried function when called without arguments", () => {
    const isEmptyCurried = isEmpty();
    expect(isEmptyCurried).toBeInstanceOf(Function);

    expect(isEmptyCurried([1, 2, 3])).toBe(false);
    expect(isEmptyCurried([])).toBe(true);
  });
});

describe("isEmpty [types]", () => {
  it("should maintain type narrowing", () => {
    const array: number[] = [];

    if (isEmpty(array)) {
      type Test = typeof array.length;
      type Expect = 0;
      expectTypeOf<Test>().toMatchTypeOf<Expect>();
    }

    if (isEmpty(array)) {
      type Test = typeof array;
      type Expect = [];
      expectTypeOf<Test>().toMatchTypeOf<Expect>();
    }
  });
});
