import { describe, expect, expectTypeOf, it } from "vitest";
import * as Maybe from "../index.js";

describe("Maybe.some [runtime]", () => {
  it(`should have _tag property with "some" value`, () => {
    const value = Maybe.some();

    expect(value).toHaveProperty("_tag", "some");
  });

  it("should return an empty some (no value property) when no argument is provided", () => {
    const value = Maybe.some();

    expect(value).not.toHaveProperty("value");
  });

  it("should return a Some with inner value when argument is provided", () => {
    const inner = "test";
    const value = Maybe.some(inner);

    expect(value).toHaveProperty("value", inner);
  });
});

describe("Some [types]", () => {
  it("should be Some<never> when no argument is provided", () => {
    const value = Maybe.some();
    type Test = typeof value;

    expectTypeOf<Test>().toMatchTypeOf<Maybe.Some<never>>();
  });

  it("should be Some<Inner> when argument is provided", () => {
    const inner: number = 10;
    const value = Maybe.some(inner);
    type Inner = typeof inner;
    type Test = typeof value;

    expectTypeOf<Test>().toMatchTypeOf<Maybe.Some<Inner>>();
  });
});
