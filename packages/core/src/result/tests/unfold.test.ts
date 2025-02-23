import { describe, expect, it } from "vitest";
import * as Result from "../index.js";

describe("Result.unfold [runtime]", () => {
  it("should return the original Ok when provided with Ok of depth 1", () => {
    const inner = 0xfafa;
    const ok = Result.ok(inner);

    const value = Result.unfold()(ok);

    expect(Result.isOk(value)).toBe(true);
    expect(value).toHaveProperty("value", inner);
  });

  it("should return the unfolded result when provided with Ok of depth n <= MAX_UNFOLD_DEPTH", () => {
    const inner = "inner";
    const run = (n: number) => {
      let ok: Result.Result<any> = Result.ok(inner);

      for (let i = 0; i < n; i++) {
        ok = Result.ok(ok);
      }

      const value = Result.unfold()(ok);

      expect(Result.isOk(value)).toBe(true);
      expect(value).toHaveProperty("value", inner);
    };

    for (let i = 1; i <= Result.MAX_UNFOLD_DEPTH; i++) run(i);
  });

  it("should return the original Err when provided with Err", () => {
    const err = Result.err();

    const value = Result.unfold()(err);

    expect(Result.isErr(value)).toBe(true);
  });

  it("should return None on nested result with ending None", () => {
    const maybe = Result.ok(Result.ok(Result.ok(Result.ok(Result.ok(Result.err())))));

    const value = Result.unfold()(maybe);

    expect(Result.isErr(value)).toBe(true);
  });
});
