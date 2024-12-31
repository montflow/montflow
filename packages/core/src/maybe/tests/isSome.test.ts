import { describe, expect, expectTypeOf, it } from "vitest";
import { isSome, Maybe, None, Some } from "..";

describe("isSome [runtime]", () => {
  it("should return true when Some is passed in", () => {
    const some = Some();
    const value = isSome(some);

    expect(value).toBe(true);
  });

  it("should return false when None is passed in", () => {
    const none = None();
    const value = isSome(none);

    expect(value).toBe(false);
  });
});

describe("isSome [types]", () => {
  it("should narrow type via control flow inference for maybe type", () => {
    const value: Maybe<number> = Maybe(10);

    if (isSome(value)) {
      expectTypeOf<typeof value>().toMatchTypeOf<Some<number>>();
    }

    if (!isSome(value)) {
      expectTypeOf<typeof value>().toMatchTypeOf<None>();
    }
  });

  it("should narrow type via control flow inference for unknow type", () => {
    const value: unknown = null;

    if (isSome(value)) {
      expectTypeOf<typeof value>().toMatchTypeOf<Some<unknown>>();
    }

    if (!isSome(value)) {
      expectTypeOf<typeof value>().toMatchTypeOf<unknown>();
    }
  });
});
