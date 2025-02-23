import { describe, expect, it } from "vitest";
import * as Nothing from "../index.js";

describe("isNothing", () => {
  it("should return true for Nothing instance", () => {
    const nothing = Nothing.make();
    const value = Nothing.isNothing(nothing);

    expect(value).toBe(true);
  });

  it("should return false for null", () => {
    const nothing = null;
    const value = Nothing.isNothing(nothing);

    expect(value).toBe(false);
  });

  it("should return false for undefined", () => {
    const nothing = undefined;
    const value = Nothing.isNothing(nothing);

    expect(value).toBe(false);
  });

  it("should return false for empty object", () => {
    const nothing = {};
    const value = Nothing.isNothing(nothing);

    expect(value).toBe(false);
  });
});
