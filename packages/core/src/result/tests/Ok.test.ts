import { describe, expect, expectTypeOf, it } from "vitest";
import { Ok } from "..";
import { Create, Nothing } from "../../nothing";

describe("Ok [runtime]", () => {
  it("should have true `ok` property", () => {
    const value = Ok();

    expect(value.ok).toBe(true);
  });

  it("should return an empty Ok when no argument is provided", () => {
    const value = Ok();

    expect(value).toHaveProperty("value", Create());
  });

  it("should return a Ok with inner value when argument is provided", () => {
    const inner = "test";
    const value = Ok(inner);

    expect(value).toHaveProperty("value", inner);
  });
});

describe("Ok [types]", () => {
  it("should be Ok<Nothing> when no argument is provided", () => {
    const value = Ok();
    type Test = typeof value;

    expectTypeOf<Test>().toMatchTypeOf<Ok<Nothing>>();
  });

  it("should be Some<Inner> when argument is provided", () => {
    const inner: number = 10;
    const value = Ok(inner);
    type Inner = typeof inner;
    type Test = typeof value;

    expectTypeOf<Test>().toMatchTypeOf<Ok<Inner>>();
  });
});
