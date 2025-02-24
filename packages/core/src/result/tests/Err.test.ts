import { describe, expect, expectTypeOf, it } from "vitest";
import * as Result from "../index.js";

describe("Result.err [runtime]", () => {
  it("should have `_tag` property", () => {
    const err = Result.err();
    expect(err).toHaveProperty("_tag");
  });

  it("should have `_tag` property set to `err`", () => {
    const err = Result.err();
    expect(err._tag).toBe("err");
  });

  it("should not have error property when no argument is provided", () => {
    const err = Result.err();
    expect(err).not.toHaveProperty("error");
  });

  it("should have error property when argument is provided", () => {
    const err = Result.err("foo");
    expect(err).toHaveProperty("error");
  });

  it("should have error property with `inner` when argument is provided", () => {
    const inner = "test";
    const err = Result.err(inner);

    expect(err).toHaveProperty("error", inner);
  });
});

describe("Result.err [types]", () => {
  it("should  return Err<never> when no argument is provided", () => {
    const value = Result.err();
    type Test = typeof value;
    type Expected = Result.Err<never>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should return Err<Inner> when argument is provided", () => {
    const inner: number = 10;
    const value = Result.err(inner);
    type Inner = typeof inner;
    type Test = typeof value;
    type Expected = Result.Err<Inner>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });
});
