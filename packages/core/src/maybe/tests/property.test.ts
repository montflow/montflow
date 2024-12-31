import { describe, expect, expectTypeOf, it } from "vitest";
import { isNone, isSome, Maybe, property, Some } from "..";

describe("property [runtime]", () => {
  it("should return Some<Inner> if provided with matching key", () => {
    const key = "a";
    const obj = { [key]: 1 };
    const maybe = Some(obj);

    const value = property(key)(maybe);

    expect(isSome(value)).toBe(true);
    if (isSome(value)) expect(value.value).toBe(obj[key]);
  });

  it("should return None if provided with incorrect key", () => {
    const key = "a";
    const obj = { [key]: 1 };
    const maybe = Some(obj);

    const value = property("b")(maybe);

    expect(isNone(value)).toBe(true);
  });
});

describe("property [types]", () => {
  it("should return Maybe<Inner> if matching correct key", () => {
    const inner = { prop1: "string", prop2: 0xf };
    const maybe = Some(inner);
    const value = property("prop1")(maybe);

    type Test = typeof value;
    type Expected = Maybe<string>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should return Maybe<unknown> if provided with non matching key", () => {
    const inner = { prop1: "string", prop2: 0xf };
    const maybe = Some(inner);
    const value = property("some other prop")(maybe);

    type Test = typeof value;
    type Expected = Maybe<unknown>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should return Maybe<any> if input is generic object", () => {
    const inner: Record<PropertyKey, any> = { prop1: "string", prop2: 0xf };
    const maybe = Some(inner);
    const value = property("some other prop")(maybe);

    type Test = typeof value;
    type Expected = Maybe<any>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should return Maybe<any> if input is any", () => {
    const inner: any = { prop1: "string", prop2: 0xf };
    const maybe = Some(inner);
    const value = property("some other prop")(maybe);

    type Test = typeof value;
    type Expected = Maybe<any>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });
});
