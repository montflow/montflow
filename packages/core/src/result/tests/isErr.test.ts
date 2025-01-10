import { describe, expect, expectTypeOf, it } from "vitest";
import { Create, Err, isErr, Ok } from "..";

describe("isOk [runtime]", () => {
  it("should return true when Err is passed in", () => {
    const err = Err();
    const value = isErr(err);

    expect(value).toBe(true);
  });

  it("should return false when Ok is passed in", () => {
    const ok = Ok();
    const value = isErr(ok);

    expect(value).toBe(false);
  });
});

describe("isErr [types]", () => {
  it("should narrow type via control flow inference for result types", () => {
    type Value = { "🖖": "👽" };
    type Error = string;

    const value = Create<Value, Error>("err", "hello");

    if (isErr(value)) {
      type Test = typeof value;
      type Expected = Err<Error>;

      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }

    if (!isErr(value)) {
      type Test = typeof value;
      type Expected = Ok<Value>;

      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }
  });

  it("should narrow type via control flow inference for unkwown type", () => {
    const value: unknown = null;

    if (isErr(value)) {
      type Test = typeof value;
      type Expected = Err<unknown>;

      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }

    if (!isErr(value)) {
      type Test = typeof value;
      type Expected = unknown;

      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }
  });
});
