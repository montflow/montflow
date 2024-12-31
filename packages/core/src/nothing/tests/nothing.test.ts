import { describe, expect, expectTypeOf, it } from "vitest";
import { Nothing } from "..";

describe("Nothing [runtime]", () => {
  it("should have true `nothing` property", () => {
    const value = Nothing();

    expect(value.nothing).toBe(true);
  });
});

describe("Nothing [types]", () => {
  it("should have `nothing` property of type `true`", () => {
    const value = Nothing();
    type Test = typeof value.nothing;

    expectTypeOf<Test>().toMatchTypeOf<true>();
  });
});
