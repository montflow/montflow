import { describe, expect, it } from "vitest";
import * as Result from "../index.js";

describe("Result.flatmap [runtime]", () => {
  it("should return Ok when result input is Ok and mapper returns Ok", () => {
    const okInner: number = 0xf;
    const okFinal: number = okInner + 0xf;
    const ok = Result.ok(okInner);
    const mapper = (x: typeof okInner) => Result.ok(x + 0xf);
    const value = Result.flatmap(mapper)(ok);

    expect(Result.isOk(value)).toBe(true);
    expect(value).toHaveProperty("value", okFinal);
  });

  it("should return Err when result input is Err and mapper returns Err", () => {
    const err = Result.err();
    const mapper = (_: number) => Result.err();
    const value = Result.flatmap(mapper)(err);

    expect(Result.isErr(value)).toBe(true);
  });

  it("should return Err when input is Err and mapper returns Ok", () => {
    const err = Result.err();
    const mapper = (x: number) => Result.ok(x);
    const value = Result.flatmap(mapper)(err);

    expect(Result.isErr(value)).toBe(true);
  });

  it("should return Err when input is Ok and mapper returns Err", () => {
    const okInner = 0;
    const ok = Result.ok(okInner);
    const mapper = (_: number) => Result.err();
    const value = Result.flatmap(mapper)(ok);

    expect(Result.isErr(value)).toBe(true);
  });
});
