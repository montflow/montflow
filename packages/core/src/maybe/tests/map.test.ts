import { describe, expect, expectTypeOf, it } from "vitest";
import * as Maybe from "../index.js";

describe("Maybe.map [runtime]", () => {
  it("should return mapped maybe's inner some value for Some inputs", () => {
    const initial = 16;
    const final = initial * 2;
    const func = (x: number) => x * 2;
    const some = Maybe.some(initial);

    const value = Maybe.map(func)(some);

    expect(Maybe.isSome(value)).toBe(true);
    expect(value).toHaveProperty("value", final);
  });

  it("should return none for None inputs", () => {
    const none = Maybe.none();
    const func = (x: number) => x * 2;

    const value = Maybe.map(func)(none);

    expect(Maybe.isNone(value)).toBe(true);
  });

  it("should work with data non-curried version", () => {
    const initial = 16;
    const final = initial * 2;
    const func = (x: number) => x * 2;
    const some = Maybe.some(initial);

    const value = Maybe.map(some, func);

    expect(Maybe.isSome(value)).toBe(true);
    expect(value).toHaveProperty("value", final);
  });
});

describe("map [types]", () => {
  it("should return new mapped Maybe type", () => {
    const inner = 10;
    const some = Maybe.some(inner);
    const mapper = (x: number): string => `${x}`;

    const value = Maybe.map(mapper)(some);

    type Test = typeof value;
    type Expected = Maybe.Maybe<string>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });
});
