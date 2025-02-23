import { describe, expect, expectTypeOf, it } from "vitest";
import * as Macro from "../../macro/index.js";
import * as Result from "../index.js";

describe("Result.Ok [runtime]", () => {
  it("should have true `ok` property", () => {
    const value = Result.ok();

    expect(value._tag).toBe("ok");
  });

  it("should return an empty Ok when no argument is provided", () => {
    const value = Result.ok();

    expect(value).toHaveProperty("value", Macro.never);
  });

  it("should return a Ok with inner value when argument is provided", () => {
    const inner = "test";
    const value = Result.ok(inner);

    expect(value).toHaveProperty("value", inner);
  });
});

describe("Ok [types]", () => {
  it("should be Ok<never> when no argument is provided", () => {
    const value = Result.ok();
    type Test = typeof value;

    expectTypeOf<Test>().toMatchTypeOf<Result.Ok<never>>();
  });

  it("should be Some<Inner> when argument is provided", () => {
    const inner: number = 10;
    const value = Result.ok(inner);
    type Inner = typeof inner;
    type Test = typeof value;

    expectTypeOf<Test>().toMatchTypeOf<Result.Ok<Inner>>();
  });
});
