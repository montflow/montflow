import { describe, expect, expectTypeOf, it } from "vitest";
import { None } from "..";

describe("None [runtime]", () => {
  it("should have false `some` property", () => {
    const value = None();

    expect(value.some).toBe(false);
  });

  it("should be identical to other None instances", () => {
    const a = None();
    const b = None();

    expect(a).toBe(b);
  });
});

describe("None [types]", () => {
  it("should be None always", () => {
    const value = None();
    type Test = typeof value;

    expectTypeOf<Test>().toMatchTypeOf<None>();
  });
});
