import { describe, expect, it } from "vitest";
import * as Result from "../index.js";

describe("Result.flatten [runtime]", () => {
  it("should return the original Ok when provided with unnested Ok", () => {
    const inner = 0xfafa;
    const ok = Result.ok(inner);

    const value = Result.flatten()(ok);

    expect(Result.isResult(value)).toBe(true);
    expect(value).toHaveProperty("value", inner);
  });

  it("should return flattened Result when nested (depth 1)", () => {
    const inner = 0xfafa;

    const r1 = Result.ok(inner);
    const r2 = Result.ok(r1);

    const value = Result.flatten()(r2);

    expect(Result.isResult(value)).toBe(true);
    expect(value).toHaveProperty("value", inner);
  });

  it("should return flattened Result when nested (depth > 1)", () => {
    const inner = 0xfafa;

    const r1 = Result.ok(inner); // Result<Inner>
    const r2 = Result.ok(r1); // Result<Result<Inner>>
    const r3 = Result.ok(r2); // Result<Result<Result<Inner>>>

    const value = Result.flatten()(r3); // r2 => Result<Result<Inner>>

    expect(Result.isResult(value)).toBe(true);
    expect(value).toStrictEqual(r2);
    expect(value).toHaveProperty("value", r1);
    expect((value as Result.Ok<any>).value).toHaveProperty("value", r1.value);
  });

  it("should return the original Err when provided with Err", () => {
    const err = Result.err();

    const value = Result.flatten()(err);

    expect(Result.isResult(value)).toBe(true);
  });
});
