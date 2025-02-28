import { describe, expect, it } from "vitest";
import * as Maybe from "../index.js";

describe("Maybe.flatmap [runtime]", () => {
  it("should return Some when input is Some and mapper returns Some", () => {
    const inner = 0;
    const some = Maybe.some(inner);
    const mapper = (x: number): Maybe.Maybe<number> => Maybe.some(x);
    const value = Maybe.flatmap(mapper)(some);

    expect(Maybe.isSome(value)).toBe(true);
    expect(value).toHaveProperty("value", inner);
  });

  it("should return None when input is None and mapper returns None", () => {
    const none = Maybe.none();
    const mapper = (_: number): Maybe.Maybe<number> => Maybe.none();
    const value = Maybe.flatmap(mapper)(none);

    expect(Maybe.isSome(value)).toBe(false);
  });

  it("should return None when input is None and mapper returns Some", () => {
    const none = Maybe.none();
    const mapper = (x: number): Maybe.Maybe<number> => Maybe.some(x);
    const value = Maybe.flatmap(mapper)(none);

    expect(Maybe.isSome(value)).toBe(false);
  });

  it("should return None when input is Some and mapper returns None", () => {
    const inner = 0;
    const some = Maybe.some(inner);
    const mapper = (_: number): Maybe.Maybe<number> => Maybe.none();
    const value = Maybe.flatmap(mapper)(some);

    expect(Maybe.isSome(value)).toBe(false);
  });
});
