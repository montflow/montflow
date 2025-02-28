import { describe, expect, expectTypeOf, it } from "vitest";
import * as Number from "../../number/index.js";
import * as String from "../../string/index.js";
import * as Maybe from "../index.js";

describe("Maybe.is [runtime]", () => {
  it("should return original Maybe when Some is passed in and guard succeeds", () => {
    const inner = 10;
    const some = Maybe.some(inner);

    const value = Maybe.is(Number.isNumber)(some);

    expect(Maybe.isSome(value)).toBe(true);
    if (Maybe.isSome(value)) expect(value.value).toBe(inner);
  });

  it("should return None when Some and guard fails", () => {
    const inner = "";
    const some = Maybe.some(inner);

    const value = Maybe.is(Number.isNumber)(some);

    expect(Maybe.isNone(value)).toBe(true);
  });

  it("should return None when None input", () => {
    const none = Maybe.none();

    const value = Maybe.is(Number.isNumber)(none);

    expect(Maybe.isNone(value)).toBe(true);
  });
});

describe("Maybe.is [types]", () => {
  it("should cast to guarded type when Some input with known Inner type", () => {
    const inner: symbol = Symbol("test");
    const some = Maybe.some(inner);

    const value = Maybe.is(Number.isNumber)(some);

    type Test = typeof value;
    type Expected = Maybe.Maybe<number>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should cast to guarded type when Some input with unknown Inner type", () => {
    const inner: unknown = Symbol("test");
    const some = Maybe.some(inner);

    const value = Maybe.is(Number.isNumber)(some);

    type Test = typeof value;
    type Expected = Maybe.Maybe<number>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should cast to guarded type with input Maybe", () => {
    const inner: symbol = Symbol("test");
    const maybe = Maybe.some(inner);

    const value = Maybe.is(String.isString)(maybe);

    type Test = typeof value;
    type Expected = Maybe.Maybe<string>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should cast to guarded type with None", () => {
    const none = Maybe.some();

    const value = Maybe.is(Number.isNumber)(none);

    type Test = typeof value;
    type Expected = Maybe.Maybe<number>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });
});
