import { describe, expect, it } from "vitest";
import * as Maybe from "../index.js";

describe("Maybe.unwrap", () => {
  it("should extract inner value of some when provided with Some instance", () => {
    const inner = 10;
    const some = Maybe.some(inner);

    const value = Maybe.unwrap()(some);

    expect(value).toBe(inner);
  });

  it("should throw error when provided with None instance", () => {
    const none = Maybe.none();
    const callback = () => Maybe.unwrap()(none);

    expect(callback).toThrow(Error);
  });
});
