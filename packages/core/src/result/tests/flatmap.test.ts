import { describe, expect, it } from "vitest";
import { Err, flatmap, isErr, isOk, Ok } from "..";

describe("flatmap [runtime]", () => {
  it("should return Ok when result input is Ok and mapper returns Ok", () => {
    const okInner: number = 0xf;
    const okFinal: number = okInner + 0xf;
    const ok = Ok(okInner);
    const mapper = (x: typeof okInner) => Ok(x + 0xf);
    const value = flatmap(mapper)(ok);

    expect(isOk(value)).toBe(true);
    expect(value).toHaveProperty("value", okFinal);
  });

  it("should return Err when result input is Err and mapper returns Err", () => {
    const err = Err();
    const mapper = (_: number) => Err();
    const value = flatmap(mapper)(err);

    expect(isErr(value)).toBe(true);
  });

  it("should return Err when input is Err and mapper returns Ok", () => {
    const err = Err();
    const mapper = (x: number) => Ok(x);
    const value = flatmap(mapper)(err);

    expect(isErr(value)).toBe(true);
  });

  it("should return Err when input is Ok and mapper returns Err", () => {
    const okInner = 0;
    const ok = Ok(okInner);
    const mapper = (_: number) => Err();
    const value = flatmap(mapper)(ok);

    expect(isErr(value)).toBe(true);
  });
});
