import { describe, expect, expectTypeOf, it } from "vitest";
import { Create } from "..";

describe("Nothing [runtime]", () => {
  it("should have true `nothing` property", () => {
    const value = Create();

    expect(value.nothing).toBe(true);
  });
});

describe("Nothing [types]", () => {
  it("should have `nothing` property of type `true`", () => {
    const value = Create();
    type Test = typeof value.nothing;

    expectTypeOf<Test>().toMatchTypeOf<true>();
  });
});
