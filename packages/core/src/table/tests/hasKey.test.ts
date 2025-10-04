import * as Vitest from "vitest";

import * as Table from "../index.js";

Vitest.describe("[runtime] Table.hasKey", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Table.hasKey).toBeDefined();
  });

  Vitest.it("should return true if the key exists and its value is not undefined", () => {
    const obj = { a: 1, b: "hello", c: true };

    Vitest.expect(Table.hasKey(obj, "a")).toBe(true);
    Vitest.expect(Table.hasKey(obj, "b")).toBe(true);
    Vitest.expect(Table.hasKey(obj, "c")).toBe(true);
  });

  Vitest.it("should return false if the key does not exist", () => {
    const obj = { a: 1, b: "hello", c: true };

    Vitest.expect(Table.hasKey(obj, "d")).toBe(false);
    Vitest.expect(Table.hasKey(obj, "e")).toBe(false);
  });

  Vitest.it("should return false if the key exists but its value is undefined", () => {
    const obj = { a: 1, b: undefined, c: true };

    Vitest.expect(Table.hasKey(obj, "b")).toBe(false);
  });

  Vitest.it("should work in curried form", () => {
    const obj = { a: 1, b: "hello", c: true };

    const hasKeyA = Table.hasKey("a");
    Vitest.expect(hasKeyA(obj)).toBe(true);

    const hasKeyD = Table.hasKey("d");
    Vitest.expect(hasKeyD(obj)).toBe(false);
  });
});

Vitest.describe("[types] Table.hasKey", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Table.hasKey;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it("should narrow the type if the key exists and its value is not undefined", () => {
    const obj = { a: 1, b: "hello", c: true };

    if (Table.hasKey(obj, "a")) {
      type Test = typeof obj.a;
      type Expected = number;
      Vitest.expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }

    if (Table.hasKey(obj, "b")) {
      type Test = typeof obj.b;
      type Expected = string;
      Vitest.expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }

    if (Table.hasKey(obj, "c")) {
      type Test = typeof obj.c;
      type Expected = boolean;
      Vitest.expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }
  });

  Vitest.it("should not narrow the type if the key does not exist", () => {
    const obj = { a: 1, b: "hello", c: true };

    if (!Table.hasKey(obj, "d")) {
      type Test = typeof obj;
      type Expected = { a: number; b: string; c: boolean };
      Vitest.expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }
  });

  Vitest.it("should not narrow the type if the key exists but its value is undefined", () => {
    const obj = { a: 1, b: undefined, c: true };

    if (!Table.hasKey(obj, "b")) {
      type Test = typeof obj;
      type Expected = { a: number; b: undefined; c: boolean };
      Vitest.expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }
  });

  Vitest.it("should work with nested objects", () => {
    const obj = { a: 1, b: { nested: "value" }, c: true };

    if (Table.hasKey(obj, "b")) {
      type Test = typeof obj.b;
      type Expected = { nested: string };
      Vitest.expectTypeOf<Test>().toMatchTypeOf<Expected>();

      if (Table.hasKey(obj.b, "nested")) {
        type NestedTest = typeof obj.b.nested;
        type NestedExpected = string;
        Vitest.expectTypeOf<NestedTest>().toMatchTypeOf<NestedExpected>();
      }
    }
  });

  Vitest.it("should narrow the type in curried form", () => {
    const obj = { a: 1, b: "hello", c: true };

    const hasKeyA = Table.hasKey("a");
    if (hasKeyA(obj)) {
      type Test = typeof obj.a;
      type Expected = number;
      Vitest.expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }

    const hasKeyD = Table.hasKey("d");
    if (!hasKeyD(obj)) {
      type Test = typeof obj;
      type Expected = { a: number; b: string; c: boolean };
      Vitest.expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }
  });
});
