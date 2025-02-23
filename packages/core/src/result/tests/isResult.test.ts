import { describe, expect, expectTypeOf, it } from "vitest";
import * as Result from "../index.js";

describe("Result.isResult [runtime]", () => {
  it("should return true when Ok value is passed in", () => {
    const ok = Result.ok();
    const value = Result.isResult(ok);

    expect(value).toBe(true);
  });

  it("should return true when Err value is passed in", () => {
    const err = Result.err();
    const value = Result.isResult(err);

    expect(value).toBe(true);
  });

  it("should return false for an arbitrary object", () => {
    const result = { prop1: "hi", prop2: 10, prop3: true };
    const value = Result.isResult(result);

    expect(value).toBe(false);
  });

  it("should return false for null", () => {
    const result = null;
    const value = Result.isResult(result);

    expect(value).toBe(false);
  });

  it("should return false for undefined", () => {
    const maybe = undefined;
    const value = Result.isResult(maybe);

    expect(value).toBe(false);
  });
});

describe("Result.isResult [types]", () => {
  it("should narrow type via control flow inference", () => {
    const value: any = null;

    if (Result.isResult(value)) {
      expectTypeOf<typeof value>().toMatchTypeOf<Result.Any>();
    }

    if (!Result.isResult(value)) {
      expectTypeOf<typeof value>().toMatchTypeOf<any>();
    }
  });
});
