import { describe, expect, it } from "vitest";
import { FromTryCatch, isErr, isOk } from "..";

describe("FromTryCatch [runtime]", () => {
  it("should return Ok when try doesn't throw and catch is provided", () => {
    const innerOk = 10;
    const value = FromTryCatch(
      () => innerOk,
      error => String(error)
    );

    expect(isOk(value)).toBe(true);
    expect(value).toHaveProperty("value", innerOk);
  });

  it("should return Err w/ error when try throws and catch is provided", () => {
    const innerErr = "🌮";
    const value = FromTryCatch(
      (): boolean => {
        throw Error();
      },
      _ => innerErr
    );

    expect(isErr(value)).toBe(true);
    expect(value).toHaveProperty("error", innerErr);
  });

  it("should return Err w/ thrown error when try throws and no catch not provided", () => {
    const innerErr = 0xf;
    const value = FromTryCatch(() => {
      throw innerErr;
    });

    expect(isErr(value)).toBe(true);
    expect(value).toHaveProperty("error", innerErr);
  });
});
