import { describe, expect, expectTypeOf, it } from "vitest";
import * as Maybe from "../index.js";

describe("Maybe.property [runtime]", () => {
  it("should return Some<Inner> if provided with matching key", () => {
    const key = "a";
    const obj = { [key]: 1 };
    const maybe = Maybe.some(obj);

    const value = Maybe.property(key)(maybe);

    expect(Maybe.isSome(value)).toBe(true);
    expect(value).toHaveProperty("value", obj[key]);
  });

  it("should return None if provided with incorrect key", () => {
    const key = "a";
    const obj = { [key]: 1 };
    const maybe = Maybe.some(obj);

    const value = Maybe.property("b")(maybe);

    expect(Maybe.isNone(value)).toBe(true);
  });
});

describe("property [types]", () => {
  it("should return Maybe<Inner> if matching correct key", () => {
    const inner = { prop1: "string", prop2: 0xf };
    const maybe = Maybe.some(inner);
    const value = Maybe.property("prop1")(maybe);

    type Test = typeof value;
    type Expected = Maybe.Maybe<string>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should return Maybe<unknown> if provided with non matching key", () => {
    const inner = { prop1: "string", prop2: 0xf };
    const maybe = Maybe.some(inner);
    const value = Maybe.property("some other prop")(maybe);

    type Test = typeof value;
    type Expected = Maybe.Maybe<unknown>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should return Maybe<any> if input is generic object", () => {
    const inner: Record<PropertyKey, any> = { prop1: "string", prop2: 0xf };
    const maybe = Maybe.some(inner);
    const value = Maybe.property("some other prop")(maybe);

    type Test = typeof value;
    type Expected = Maybe.Maybe<any>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should return Maybe<any> if input is any", () => {
    const inner: any = { prop1: "string", prop2: 0xf };
    const maybe = Maybe.some(inner);
    const value = Maybe.property("some other prop")(maybe);

    type Test = typeof value;
    type Expected = Maybe.Maybe<any>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });
});
