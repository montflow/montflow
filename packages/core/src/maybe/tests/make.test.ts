import { describe, expect, it } from "vitest";
import * as Maybe from "../index.js";

describe("Maybe.make [runtime]", () => {
  it(`should return none when "none" tag is passed in.`, () => {
    const maybe = Maybe.make("none");

    expect(Maybe.isNone(maybe)).toBe(true);
  });

  it(`should return Some<never> when "some" tag is passed in without any aditional parameters.`, () => {
    const maybe = Maybe.make("some");

    expect(Maybe.isSome(maybe)).toBe(true);
    expect(maybe).not.toHaveProperty("value");
  });

  it(`should return Some when "some" tag is passed in with the aditinal internal value`, () => {
    const inner = 10;
    const maybe = Maybe.make("some", inner);

    expect(Maybe.isSome(maybe)).toBe(true);
    expect(maybe).toHaveProperty("value", inner);
  });
});
