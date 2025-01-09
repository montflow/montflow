import { describe, expect, it } from "vitest";
import { isNone, isSome, make, None, Some, tryMap } from "..";

describe("tryMap [runtime]", () => {
  it("should work with data-first api", () => {
    const inner = 0;
    const maybe = make(inner);
    const mapper = (x: number): number => x + 1;
    const value = tryMap(maybe, mapper);

    expect(isSome(value)).toBe(true);
    expect(value).toHaveProperty("value", inner + 1);
  });

  it("should return Some when input is Some and mapper does not throw", () => {
    const inner = 0;
    const some = Some(inner);
    const mapper = (x: number): number => x + 1;
    const value = tryMap(mapper)(some);

    expect(isSome(value)).toBe(true);
    expect(value).toHaveProperty("value", inner + 1);
  });

  it("should return None when input is Some and mapper throws", () => {
    const inner = 0;
    const some = Some(inner);
    const mapper = (_: number) => {
      throw new Error("Error during mapping");
    };
    const value = tryMap(mapper)(some);

    expect(isSome(value)).toBe(false);
    expect(isNone(value)).toBe(true);
  });

  it("should return None when input is None and mapper does not throw", () => {
    const none = None();
    const mapper = (x: number): number => x + 1;
    const value = tryMap(mapper)(none);

    expect(isSome(value)).toBe(false);
  });

  it("should return None when input is None and mapper throws", () => {
    const none = None();
    const mapper = (_: number): number => {
      throw new Error("Error during mapping");
    };
    const value = tryMap(mapper)(none);

    expect(isSome(value)).toBe(false);
  });
});
