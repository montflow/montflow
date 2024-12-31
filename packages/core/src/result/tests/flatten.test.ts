import { describe, expect, it } from "vitest";
import { Err, flatten, isErr, isOk, Ok } from "..";

describe("flatten [runtime]", () => {
  it("should return the original Ok when provided with unnested Ok", () => {
    const inner = 0xfafa;
    const ok = Ok(inner);

    const value = flatten()(ok);

    expect(isOk(value)).toBe(true);
    expect(value).toHaveProperty("value", inner);
  });

  it("should return flattened Result when nested (depth 1)", () => {
    const inner = 0xfafa;

    const r1 = Ok(inner);
    const r2 = Ok(r1);

    const value = flatten()(r2);

    expect(isOk(value)).toBe(true);
    expect(value).toHaveProperty("value", inner);
  });

  it("should return flattened Result when nested (depth > 1)", () => {
    const inner = 0xfafa;

    const r1 = Ok(inner); // Result<Inner>
    const r2 = Ok(r1); // Result<Result<Inner>>
    const r3 = Ok(r2); // Result<Result<Result<Inner>>>

    const value = flatten()(r3); // r2 => Result<Result<Inner>>

    expect(isOk(value)).toBe(true);
    expect(value).toStrictEqual(r2);
    expect(value).toHaveProperty("value", r1);
    expect((value as Ok<any>).value).toHaveProperty("value", r1.value);
  });

  it("should return the original Err when provided with Err", () => {
    const err = Err();

    const value = flatten()(err);

    expect(isErr(value)).toBe(true);
  });
});
