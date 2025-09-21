import * as Vitest from "vitest";

import * as Object from "../index.js";

Vitest.describe("[runtime] Object.isObject", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Object.isObject).toBeDefined();
  });

  Vitest.it("should return true for objects", () => {
    Vitest.expect(Object.isObject({})).toBe(true);
    Vitest.expect(Object.isObject({ key: "value" })).toBe(true);
    Vitest.expect(Object.isObject([])).toBe(true); // Arrays are objects in JavaScript
    Vitest.expect(Object.isObject(new Date())).toBe(true); // Built-in objects
    Vitest.expect(Object.isObject(/regex/)).toBe(true); // Regular expressions are objects
  });

  Vitest.it("should return false for non-object values", () => {
    Vitest.expect(Object.isObject(null)).toBe(false);
    Vitest.expect(Object.isObject(undefined)).toBe(false);
    Vitest.expect(Object.isObject(42)).toBe(false);
    Vitest.expect(Object.isObject("string")).toBe(false);
    Vitest.expect(Object.isObject(true)).toBe(false);
    Vitest.expect(Object.isObject(Symbol("symbol"))).toBe(false);
    Vitest.expect(Object.isObject(() => {})).toBe(false); // Functions are not objects in this context
  });
});

Vitest.describe("[types] Object.isObject", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Object.isObject;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it("should narrow type to Object for objects", () => {
    const obj = { key: "value" };

    if (Object.isObject(obj)) {
      type Test = typeof obj;
      type Expected = Object;
      Vitest.expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }
  });

  Vitest.it("should narrow type to Object for arrays", () => {
    const array = [1, 2, 3];

    if (Object.isObject(array)) {
      type Test = typeof array;
      type Expected = Object;
      Vitest.expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }
  });

  Vitest.it("should narrow type to Object for built-in objects", () => {
    const date = new Date();

    if (Object.isObject(date)) {
      type Test = typeof date;
      type Expected = Object;
      Vitest.expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }
  });

  Vitest.it("should not narrow type for non-object values", () => {
    const value: unknown = 42;

    if (!Object.isObject(value)) {
      type Test = typeof value;
      type Expected = unknown;
      Vitest.expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }
  });
});
