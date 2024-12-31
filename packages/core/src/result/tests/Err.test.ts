import { describe, expect, expectTypeOf, it } from "vitest";
import { Err } from "..";
import { Nothing } from "../../nothing";

describe("Err [runtime]", () => {
  it("should have false `ok` property", () => {
    const value = Err();
    expect(value.ok).toBe(false);
  });

  it("should return an empty Err when no argument is provided", () => {
    const value = Err();

    expect(value).toHaveProperty("error", Nothing());
  });

  it("should return a Err with inner value when argument is provided", () => {
    const inner = "test";
    const value = Err(inner);

    expect(value).toHaveProperty("error", inner);
  });
});

describe("Ok [types]", () => {
  it("should be Err<Nothing> when no argument is provided", () => {
    const value = Err();
    type Test = typeof value;

    expectTypeOf<Test>().toMatchTypeOf<Err<Nothing>>();
  });

  it("should be Err<Inner> when argument is provided", () => {
    const inner: number = 10;
    const value = Err(inner);
    type Inner = typeof inner;
    type Test = typeof value;

    expectTypeOf<Test>().toMatchTypeOf<Err<Inner>>();
  });
});
