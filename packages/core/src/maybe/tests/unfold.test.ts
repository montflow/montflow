import { describe, expect, it } from "vitest";
import * as Maybe from "../index.js";

describe("unfold [runtime]", () => {
  it("should return the original Some when provided with Some of depth 1", () => {
    const inner = 0xfafa;
    const some = Maybe.some(inner);

    const value = Maybe.unfold()(some);

    expect(Maybe.isSome(value)).toBe(true);
    expect(value).toHaveProperty("value", inner);
  });

  it("should return the unwraped maybe when provided with Some of depth n <= MAX_UNFOLD_DEPTH", () => {
    const inner = "inner";
    const run = (n: number) => {
      let some: Maybe.Maybe<any> = Maybe.some(inner);

      for (let i = 0; i < n; i++) {
        some = Maybe.some(some);
      }

      const value = Maybe.unfold()(some);

      expect(Maybe.isSome(value)).toBe(true);
      expect(value).toHaveProperty("value", inner);
    };

    for (let i = 1; i <= Maybe.MAX_UNFOLD_DEPTH; i++) run(i);
  });

  it("should return the original None when provided with None", () => {
    const none = Maybe.none();

    const value = Maybe.unfold()(none);

    expect(Maybe.isNone(value)).toBe(true);
  });

  it("should return None on nested maybe with inner None", () => {
    const maybe = Maybe.make(
      "some",
      Maybe.make("some", Maybe.make("some", Maybe.make("some", Maybe.make("none"))))
    );

    const value = Maybe.unfold()(maybe);

    expect(Maybe.isNone(value)).toBe(true);
  });
});
