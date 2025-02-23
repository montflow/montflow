import { describe, expect, it } from "vitest";
import * as Result from "../index.js";

describe("Result.map [runtime]", () => {
  it("should return mapped Ok value if input result is instance of Ok", () => {
    const okInitial = 16;
    const okFinal = okInitial * 2;
    const mapper = (x: number) => x * 2;
    const ok = Result.ok(okInitial);

    const value = Result.map(mapper)(ok);

    expect(Result.isOk(value)).toBe(true);
    expect(value).toHaveProperty("value", okFinal);
  });

  it("should return Err if input result is intance of Err", () => {
    const err = Result.err();
    const mapper = (x: number) => x * 2;

    const value = Result.map(mapper)(err);

    expect(Result.isErr(value)).toBe(true);
  });
});
