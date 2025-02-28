import { describe, expect, expectTypeOf, it } from "vitest";
import * as Maybe from "../index.js";

describe("Maybe.none [runtime]", () => {
  it(`should have _tag property with value "none"`, () => {
    const none = Maybe.none();

    expect(none).toHaveProperty("_tag", "none");
  });

  it("should be identical to other None instances", () => {
    const a = Maybe.none();
    const b = Maybe.none();

    expect(a).toBe(b);
  });
});

describe("Maybe.none [types]", () => {
  it("should be None always", () => {
    const value = Maybe.none();
    type Test = typeof value;

    expectTypeOf<Test>().toMatchTypeOf<Maybe.None>();
  });
});
