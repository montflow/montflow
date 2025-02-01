import { describe, expect, expectTypeOf, it } from "vitest";
import { hasKey } from "..";

describe("hasKey [runtime]", () => {
  it("should return true if the key exists and its value is not undefined", () => {
    const obj = { a: 1, b: "hello", c: true };

    expect(hasKey(obj, "a")).toBe(true);
    expect(hasKey(obj, "b")).toBe(true);
    expect(hasKey(obj, "c")).toBe(true);
  });

  it("should return false if the key does not exist", () => {
    const obj = { a: 1, b: "hello", c: true };

    expect(hasKey(obj, "d")).toBe(false);
    expect(hasKey(obj, "e")).toBe(false);
  });

  it("should return false if the key exists but its value is undefined", () => {
    const obj = { a: 1, b: undefined, c: true };

    expect(hasKey(obj, "b")).toBe(false);
  });

  it("should work in curried form", () => {
    const obj = { a: 1, b: "hello", c: true };

    const hasKeyA = hasKey("a");
    expect(hasKeyA(obj)).toBe(true);

    const hasKeyD = hasKey("d");
    expect(hasKeyD(obj)).toBe(false);
  });
});

describe("hasKey [types]", () => {
  it("should narrow the type if the key exists and its value is not undefined", () => {
    const obj = { a: 1, b: "hello", c: true };

    if (hasKey(obj, "a")) {
      type Test = typeof obj.a;
      type Expected = number;
      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }

    if (hasKey(obj, "b")) {
      type Test = typeof obj.b;
      type Expected = string;
      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }

    if (hasKey(obj, "c")) {
      type Test = typeof obj.c;
      type Expected = boolean;
      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }
  });

  it("should not narrow the type if the key does not exist", () => {
    const obj = { a: 1, b: "hello", c: true };

    if (!hasKey(obj, "d")) {
      type Test = typeof obj;
      type Expected = { a: number; b: string; c: boolean };
      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }
  });

  it("should not narrow the type if the key exists but its value is undefined", () => {
    const obj = { a: 1, b: undefined, c: true };

    if (!hasKey(obj, "b")) {
      type Test = typeof obj;
      type Expected = { a: number; b: undefined; c: boolean };
      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }
  });

  it("should work with nested objects", () => {
    const obj = { a: 1, b: { nested: "value" }, c: true };

    if (hasKey(obj, "b")) {
      type Test = typeof obj.b;
      type Expected = { nested: string };
      expectTypeOf<Test>().toMatchTypeOf<Expected>();

      if (hasKey(obj.b, "nested")) {
        type NestedTest = typeof obj.b.nested;
        type NestedExpected = string;
        expectTypeOf<NestedTest>().toMatchTypeOf<NestedExpected>();
      }
    }
  });

  it("should narrow the type in curried form", () => {
    const obj = { a: 1, b: "hello", c: true };

    const hasKeyA = hasKey("a");
    if (hasKeyA(obj)) {
      type Test = typeof obj.a;
      type Expected = number;
      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }

    const hasKeyD = hasKey("d");
    if (!hasKeyD(obj)) {
      type Test = typeof obj;
      type Expected = { a: number; b: string; c: boolean };
      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }
  });
});
