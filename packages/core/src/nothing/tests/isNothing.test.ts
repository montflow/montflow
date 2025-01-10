import { describe, expect, it } from "vitest";
import { Create, isNothing } from "..";

describe("isNothing", () => {
  it("should return true for Nothing instance", () => {
    const nothing = Create();
    const value = isNothing(nothing);

    expect(value).toBe(true);
  });

  it("should return false for null", () => {
    const nothing = null;
    const value = isNothing(nothing);

    expect(value).toBe(false);
  });

  it("should return false for undefined", () => {
    const nothing = undefined;
    const value = isNothing(nothing);

    expect(value).toBe(false);
  });

  it("should return false for empty object", () => {
    const nothing = {};
    const value = isNothing(nothing);

    expect(value).toBe(false);
  });
});
