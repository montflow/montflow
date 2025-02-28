import { describe, expect, expectTypeOf, it } from "vitest";
import * as Maybe from "../index.js";

describe("Maybe.isMaybe [runtime]", () => {
  it("should return true when Maybe.some value is passed in", () => {
    const some = Maybe.some();
    const value = Maybe.isMaybe(some);

    expect(value).toBe(true);
  });

  it("should return true when Maybe.none value is passed in", () => {
    const none = Maybe.none();
    const value = Maybe.isMaybe(none);

    expect(value).toBe(true);
  });

  it("should return false for an arbitrary object", () => {
    const maybe = { prop1: "hi", prop2: 10, prop3: true };
    const value = Maybe.isMaybe(maybe);

    expect(value).toBe(false);
  });

  it("should return false for null", () => {
    const maybe = null;
    const value = Maybe.isMaybe(maybe);

    expect(value).toBe(false);
  });

  it("should return false for undefined", () => {
    const maybe = undefined;
    const value = Maybe.isMaybe(maybe);

    expect(value).toBe(false);
  });
});

describe("isMaybe [types]", () => {
  it("should narrow type via control flow inference", () => {
    const value: any = null;

    if (Maybe.isMaybe(value)) {
      expectTypeOf<typeof value>().toMatchTypeOf<Maybe.Maybe<any>>();
    }

    if (!Maybe.isMaybe(value)) {
      expectTypeOf<typeof value>().toMatchTypeOf<any>();
    }
  });
});
