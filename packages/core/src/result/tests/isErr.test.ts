import { describe, expect, expectTypeOf, it } from "vitest";
import * as Result from "../index.js";

describe("Result.isErr [runtime]", () => {
  it("should return true when Err is passed in", () => {
    const inner = Result.err();
    const value = Result.isErr(inner);

    expect(value).toBe(true);
  });

  it("should return false when Ok is passed in", () => {
    const ok = Result.ok();
    const value = Result.isErr(ok);

    expect(value).toBe(false);
  });
});

describe("Result.isErr [types]", () => {
  it("should narrow type via control flow inference for result types", () => {
    type Value = { "🖖": "👽" };
    type Error = string;

    const value = {} as Result.Result<Value, Error>;

    if (Result.isErr(value)) {
      type Test = typeof value;
      type Expected = Result.Err<Error>;

      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }

    if (!Result.isErr(value)) {
      type Test = typeof value;
      type Expected = Result.Ok<Value>;

      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }
  });

  it("should narrow type via control flow inference for unkwown type", () => {
    const value = {} as unknown;

    if (Result.isErr(value)) {
      type Test = typeof value;
      type Expected = Result.Err<unknown>;

      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }

    if (!Result.isErr(value)) {
      type Test = typeof value;
      type Expected = unknown;

      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }
  });
});
