import * as Vitest from "vitest";

import * as Table from "../index.js";

Vitest.describe("[runtime] Table.isObject", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Table.isObject).toBeDefined();
  });

  Vitest.it("should return true for objects", () => {
    Vitest.expect(Table.isObject({})).toBe(true);
    Vitest.expect(Table.isObject({ key: "value" })).toBe(true);
    Vitest.expect(Table.isObject([])).toBe(true); // Arrays are objects in JavaScript
    Vitest.expect(Table.isObject(new Date())).toBe(true); // Built-in objects
    Vitest.expect(Table.isObject(/regex/)).toBe(true); // Regular expressions are objects
  });

  Vitest.it("should return false for non-object values", () => {
    Vitest.expect(Table.isObject(null)).toBe(false);
    Vitest.expect(Table.isObject(undefined)).toBe(false);
    Vitest.expect(Table.isObject(42)).toBe(false);
    Vitest.expect(Table.isObject("string")).toBe(false);
    Vitest.expect(Table.isObject(true)).toBe(false);
    Vitest.expect(Table.isObject(Symbol("symbol"))).toBe(false);
    Vitest.expect(Table.isObject(() => {})).toBe(false); // Functions are not objects in this context
  });
});

Vitest.describe("[types] Table.isObject", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Table.isObject;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it("should narrow type to Object for objects", () => {
    const obj = { key: "value" };

    if (Table.isObject(obj)) {
      type Test = typeof obj;
      type Expected = Object;
      Vitest.expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }
  });

  Vitest.it("should narrow type to Object for arrays", () => {
    const array = [1, 2, 3];

    if (Table.isObject(array)) {
      type Test = typeof array;
      type Expected = Object;
      Vitest.expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }
  });

  Vitest.it("should narrow type to Object for built-in objects", () => {
    const date = new Date();

    if (Table.isObject(date)) {
      type Test = typeof date;
      type Expected = Object;
      Vitest.expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }
  });

  Vitest.it("should not narrow type for non-object values", () => {
    const value: unknown = 42;

    if (!Table.isObject(value)) {
      type Test = typeof value;
      type Expected = unknown;
      Vitest.expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }
  });
});
