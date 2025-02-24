import { describe, expect, expectTypeOf, it } from "vitest";
import { Some } from "..";
import * as Nothing from "../../nothing/index.js";

describe("Some [runtime]", () => {
  it("should have true `some` property", () => {
    const value = Some();

    expect(value.some).toBe(true);
  });

  it("should return an empty some when no argument is provided", () => {
    const value = Some();

    expect(value).toHaveProperty("value", Nothing.make());
  });

  it("should return a Some with inner value when argument is provided", () => {
    const inner = "test";
    const value = Some(inner);

    expect(value).toHaveProperty("value", inner);
  });
});

describe("Some [types]", () => {
  it("should be Some<Nothing> when no argument is provided", () => {
    const value = Some();
    type Test = typeof value;

    expectTypeOf<Test>().toMatchTypeOf<Some<Nothing.Nothing>>();
  });

  it("should be Some<Inner> when argument is provided", () => {
    const inner: number = 10;
    const value = Some(inner);
    type Inner = typeof inner;
    type Test = typeof value;

    expectTypeOf<Test>().toMatchTypeOf<Some<Inner>>();
  });
});
