import { describe, expect, it } from "vitest";
import { Err, isErr, isOk, MAX_UNFOLD_DEPTH, Ok, Result, unfold } from "..";

describe("unfold [runtime]", () => {
  it("should return the original Ok when provided with Ok of depth 1", () => {
    const inner = 0xfafa;
    const ok = Ok(inner);

    const value = unfold()(ok);

    expect(isOk(value)).toBe(true);
    expect(value).toHaveProperty("value", inner);
  });

  it("should return the unfolded result when provided with Ok of depth n <= MAX_UNFOLD_DEPTH", () => {
    const inner = "inner";
    const run = (n: number) => {
      let ok: Result<any> = Ok(inner);

      for (let i = 0; i < n; i++) {
        ok = Ok(ok);
      }

      const value = unfold()(ok);

      expect(isOk(value)).toBe(true);
      expect(value).toHaveProperty("value", inner);
    };

    for (let i = 1; i <= MAX_UNFOLD_DEPTH; i++) run(i);
  });

  it("should return the original Err when provided with Err", () => {
    const err = Err();

    const value = unfold()(err);

    expect(isErr(value)).toBe(true);
  });

  it("should return None on nested result with ending None", () => {
    const maybe = Ok(Ok(Ok(Ok(Ok(Err())))));

    const value = unfold()(maybe);

    expect(isErr(value)).toBe(true);
  });
});
