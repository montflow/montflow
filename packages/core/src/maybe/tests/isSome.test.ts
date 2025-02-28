import { describe, expect, expectTypeOf, it } from "vitest";
import * as Maybe from "../index.js";

describe("Maybe.isSome [runtime]", () => {
  it("should return true whenMaybe.some is passed in", () => {
    const some = Maybe.some();
    const value = Maybe.isSome(some);

    expect(value).toBe(true);
  });

  it("should return false when None is passed in", () => {
    const none = Maybe.none();
    const value = Maybe.isSome(none);

    expect(value).toBe(false);
  });
});

describe("Maybe.isSome [types]", () => {
  it("should narrow type via control flow inference for maybe type", () => {
    const value: Maybe.Maybe<number> = Maybe.make("none");

    if (Maybe.isSome(value)) {
      expectTypeOf<typeof value>().toMatchTypeOf<Maybe.Some<number>>();
    }

    if (!Maybe.isSome(value)) {
      expectTypeOf<typeof value>().toMatchTypeOf<Maybe.None>();
    }
  });

  it("should narrow type via control flow inference for unknow type", () => {
    const value: unknown = null;

    if (Maybe.isSome(value)) {
      expectTypeOf<typeof value>().toMatchTypeOf<Maybe.Some<unknown>>();
    }

    if (!Maybe.isSome(value)) {
      expectTypeOf<typeof value>().toMatchTypeOf<unknown>();
    }
  });
});
