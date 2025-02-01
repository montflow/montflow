import { describe, expect, expectTypeOf, it } from "vitest";
import { isObject } from "..";

describe("isObject [runtime]", () => {
  it("should return true for objects", () => {
    expect(isObject({})).toBe(true);
    expect(isObject({ key: "value" })).toBe(true);
    expect(isObject([])).toBe(true); // Arrays are objects in JavaScript
    expect(isObject(new Date())).toBe(true); // Built-in objects
    expect(isObject(/regex/)).toBe(true); // Regular expressions are objects
  });

  it("should return false for non-object values", () => {
    expect(isObject(null)).toBe(false);
    expect(isObject(undefined)).toBe(false);
    expect(isObject(42)).toBe(false);
    expect(isObject("string")).toBe(false);
    expect(isObject(true)).toBe(false);
    expect(isObject(Symbol("symbol"))).toBe(false);
    expect(isObject(() => {})).toBe(false); // Functions are not objects in this context
  });
});

describe("isObject [types]", () => {
  it("should narrow type to Object for objects", () => {
    const obj = { key: "value" };

    if (isObject(obj)) {
      type Test = typeof obj;
      type Expected = Object;
      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }
  });

  it("should narrow type to Object for arrays", () => {
    const array = [1, 2, 3];

    if (isObject(array)) {
      type Test = typeof array;
      type Expected = Object;
      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }
  });

  it("should narrow type to Object for built-in objects", () => {
    const date = new Date();

    if (isObject(date)) {
      type Test = typeof date;
      type Expected = Object;
      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }
  });

  it("should not narrow type for non-object values", () => {
    const value: unknown = 42;

    if (!isObject(value)) {
      type Test = typeof value;
      type Expected = unknown;
      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }
  });
});
