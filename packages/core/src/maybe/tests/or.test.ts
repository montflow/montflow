import { describe, expect, it } from "vitest";
import * as Maybe from "../index.js";

describe("Maybe.or [runtime]", () => {
  it("should return the inner value when provided with Some instance", () => {
    const inner = "test";
    const some = Maybe.some(inner);

    const value = Maybe.or("hello")(some);

    expect(value).toBe(inner);
  });

  it("should return the inner value when provided with Some instance", () => {
    const alteranative = "test";
    const none = Maybe.none();

    const value = Maybe.or(alteranative)(none);

    expect(value).toBe(alteranative);
  });
});
