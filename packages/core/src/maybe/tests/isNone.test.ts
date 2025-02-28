import { describe, expect, expectTypeOf, it } from "vitest";
import * as Maybe from "../index.js";

describe("Maybe.isNone [runtime]", () => {
  it("should return true when None is passed in", () => {
    const none = Maybe.none();
    const value = Maybe.isNone(none);

    expect(value).toBe(true);
  });

  it("should return false when Some is passed in", () => {
    const some = Maybe.some();
    const value = Maybe.isNone(some);

    expect(value).toBe(false);
  });
});

describe("Maybe.isNone [types]", () => {
  it("should narrow type via control flow inference for maybe type", () => {
    const value = Maybe.make("some", 10);

    if (Maybe.isNone(value)) {
      expectTypeOf<typeof value>().toMatchTypeOf<Maybe.None>();
    }

    if (!Maybe.isNone(value)) {
      expectTypeOf<typeof value>().toMatchTypeOf<Maybe.Some<number>>();
    }
  });

  it("should narrow type via control flow inference for unknow type", () => {
    const value: unknown = null;

    if (Maybe.isNone(value)) {
      expectTypeOf<typeof value>().toMatchTypeOf<Maybe.None>();
    }

    if (!Maybe.isNone(value)) {
      expectTypeOf<typeof value>().toMatchTypeOf<unknown>();
    }
  });
});
