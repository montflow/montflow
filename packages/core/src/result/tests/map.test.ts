import { describe, expect, it } from "vitest";
import { Err, isErr, isOk, map, Ok } from "..";

describe("map [runtime]", () => {
  it("should return mapped Ok value if input result is instance of Ok", () => {
    const okInitial = 16;
    const okFinal = okInitial * 2;
    const mapper = (x: number) => x * 2;
    const ok = Ok(okInitial);

    const value = map(mapper)(ok);

    expect(isOk(value)).toBe(true);
    expect(value).toHaveProperty("value", okFinal);
  });

  it("should return Err if input result is intance of Err", () => {
    const err = Err();
    const mapper = (x: number) => x * 2;

    const value = map(mapper)(err);

    expect(isErr(value)).toBe(true);
  });
});
