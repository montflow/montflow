import { describe, expect, expectTypeOf, it } from "vitest";
import * as Object from "../index.js";

describe("Object.isObject [runtime]", () => {
  it("should return true for objects", () => {
    expect(Object.isObject({})).toBe(true);
    expect(Object.isObject({ key: "value" })).toBe(true);
    expect(Object.isObject([])).toBe(true); // Arrays are objects in JavaScript
    expect(Object.isObject(new Date())).toBe(true); // Built-in objects
    expect(Object.isObject(/regex/)).toBe(true); // Regular expressions are objects
  });

  it("should return false for non-object values", () => {
    expect(Object.isObject(null)).toBe(false);
    expect(Object.isObject(undefined)).toBe(false);
    expect(Object.isObject(42)).toBe(false);
    expect(Object.isObject("string")).toBe(false);
    expect(Object.isObject(true)).toBe(false);
    expect(Object.isObject(Symbol("symbol"))).toBe(false);
    expect(Object.isObject(() => {})).toBe(false); // Functions are not objects in this context
  });
});

describe("Object.isObject [types]", () => {
  it("should narrow type to Object for objects", () => {
    const obj = { key: "value" };

    if (Object.isObject(obj)) {
      type Test = typeof obj;
      type Expected = Object;
      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }
  });

  it("should narrow type to Object for arrays", () => {
    const array = [1, 2, 3];

    if (Object.isObject(array)) {
      type Test = typeof array;
      type Expected = Object;
      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }
  });

  it("should narrow type to Object for built-in objects", () => {
    const date = new Date();

    if (Object.isObject(date)) {
      type Test = typeof date;
      type Expected = Object;
      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }
  });

  it("should not narrow type for non-object values", () => {
    const value: unknown = 42;

    if (!Object.isObject(value)) {
      type Test = typeof value;
      type Expected = unknown;
      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }
  });
});
