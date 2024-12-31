import { describe, expect, expectTypeOf, it } from "vitest";
import * as Result from "..";
import { Err, isResult, Ok } from "..";

describe("isResult [runtime]", () => {
  it("should return true when Ok value is passed in", () => {
    const ok = Ok();
    const value = isResult(ok);

    expect(value).toBe(true);
  });

  it("should return true when Err value is passed in", () => {
    const err = Err();
    const value = isResult(err);

    expect(value).toBe(true);
  });

  it("should return false for an arbitrary object", () => {
    const result = { prop1: "hi", prop2: 10, prop3: true };
    const value = isResult(result);

    expect(value).toBe(false);
  });

  it("should return false for null", () => {
    const result = null;
    const value = isResult(result);

    expect(value).toBe(false);
  });

  it("should return false for undefined", () => {
    const maybe = undefined;
    const value = isResult(maybe);

    expect(value).toBe(false);
  });
});

describe("isMaybe [types]", () => {
  it("should narrow type via control flow inference", () => {
    const value: any = null;

    if (isResult(value)) {
      expectTypeOf<typeof value>().toMatchTypeOf<Result.Any>();
    }

    if (!isResult(value)) {
      expectTypeOf<typeof value>().toMatchTypeOf<any>();
    }
  });
});
