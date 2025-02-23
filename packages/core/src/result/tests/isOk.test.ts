import { describe, expect, expectTypeOf, it } from "vitest";
import * as Result from "../index.js";

describe("Result.isOk [runtime]", () => {
  it("should return true when Ok is passed in", () => {
    const ok = Result.ok();

    expect(Result.isOk(ok)).toBe(true);
  });

  it("should return false when Err is passed in", () => {
    const err = Result.err();

    expect(Result.isOk(err)).toBe(false);
  });
});

describe("Result.isOk [types]", () => {
  it("should narrow type via control flow inference for result type", () => {
    type Value = number;
    type Error = { code: string };

    const value = {} as Result.Result<Value, Error>;

    if (Result.isOk(value)) {
      type Test = typeof value;
      type Expected = Result.Ok<Value>;

      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }

    if (!Result.isOk(value)) {
      type Test = typeof value;
      type Expected = Result.Err<Error>;

      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }
  });

  it("should narrow type via control flow inference for result unknown type", () => {
    const value: unknown = null;

    if (Result.isOk(value)) {
      type Test = typeof value;
      type Expected = Result.Ok<unknown>;

      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }

    if (!Result.isOk(value)) {
      type Test = typeof value;
      type Expected = unknown;

      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }
  });
});
