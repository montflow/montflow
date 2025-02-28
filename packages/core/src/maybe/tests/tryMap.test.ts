import { describe, expect, it } from "vitest";
import * as Maybe from "../index.js";

describe("Maybe.tryMap [runtime]", () => {
  it("should work with data-first api", () => {
    const inner = 0;
    const maybe = Maybe.make("some", inner);
    const mapper = (x: number): number => x + 1;
    const value = Maybe.tryMap(maybe, mapper);

    expect(Maybe.isSome(value)).toBe(true);
    expect(value).toHaveProperty("value", inner + 1);
  });

  it("should return Some when input is Some and mapper does not throw", () => {
    const inner = 0;
    const some = Maybe.some(inner);
    const mapper = (x: number): number => x + 1;
    const value = Maybe.tryMap(mapper)(some);

    expect(Maybe.isSome(value)).toBe(true);
    expect(value).toHaveProperty("value", inner + 1);
  });

  it("should return None when input is Some and mapper throws", () => {
    const inner = 0;
    const some = Maybe.some(inner);
    const mapper = (_: number) => {
      throw new Error("Error during mapping");
    };
    const value = Maybe.tryMap(mapper)(some);

    expect(Maybe.isSome(value)).toBe(false);
    expect(Maybe.isNone(value)).toBe(true);
  });

  it("should return None when input is None and mapper does not throw", () => {
    const none = Maybe.none();
    const mapper = (x: number): number => x + 1;
    const value = Maybe.tryMap(mapper)(none);

    expect(Maybe.isSome(value)).toBe(false);
  });

  it("should return None when input is None and mapper throws", () => {
    const none = Maybe.none();
    const mapper = (_: number): number => {
      throw new Error("Error during mapping");
    };
    const value = Maybe.tryMap(mapper)(none);

    expect(Maybe.isSome(value)).toBe(false);
  });
});
