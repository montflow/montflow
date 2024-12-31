import { describe, expect, expectTypeOf, it } from "vitest";
import { isMaybe, Maybe, None, Some } from "..";

describe("isMaybe [runtime]", () => {
  it("should return true when Some value is passed in", () => {
    const some = Some();
    const value = isMaybe(some);

    expect(value).toBe(true);
  });

  it("should return true when None value is passed in", () => {
    const none = None();
    const value = isMaybe(none);

    expect(value).toBe(true);
  });

  it("should return false for an arbitrary object", () => {
    const maybe = { prop1: "hi", prop2: 10, prop3: true };
    const value = isMaybe(maybe);

    expect(value).toBe(false);
  });

  it("should return false for null", () => {
    const maybe = null;
    const value = isMaybe(maybe);

    expect(value).toBe(false);
  });

  it("should return false for undefined", () => {
    const maybe = undefined;
    const value = isMaybe(maybe);

    expect(value).toBe(false);
  });
});

describe("isMaybe [types]", () => {
  it("should narrow type via control flow inference", () => {
    const value: any = null;

    if (isMaybe(value)) {
      expectTypeOf<typeof value>().toMatchTypeOf<Maybe<any>>();
    }

    if (!isMaybe(value)) {
      expectTypeOf<typeof value>().toMatchTypeOf<any>();
    }
  });
});
