import { describe, expect, it } from "vitest";
import * as Maybe from "../index.js";

describe("Maybe.check [runtime]", () => {
  it("should return original Maybe when input is Some and predicate evaluates true", () => {
    const some = Maybe.some(5);
    const predicate = (x: number): boolean => x > 3;
    const value = Maybe.check(predicate)(some);

    expect(Maybe.isSome(value)).toBe(true);
    expect(value).toBe(some);
  });

  it("should return None when input is Some and predicate evaluates false", () => {
    const some = Maybe.some(5);
    const predicate = (x: number): boolean => x > 12;
    const value = Maybe.check(predicate)(some);

    expect(Maybe.isSome(value)).toBe(false);
  });

  it("should return original Maybe when input is None and predicate evaluates true", () => {
    const none = Maybe.none();
    const predicate = (x: number): boolean => x > 3;
    const value = Maybe.check(predicate)(none);

    expect(Maybe.isSome(value)).toBe(false);
    expect(value).toBe(none);
  });
});
