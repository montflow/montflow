import { describe, expect, expectTypeOf, it } from "vitest";
import { Create, Err, isOk, Ok } from "..";

describe("isOk [runtime]", () => {
  it("should return true when Ok is passed in", () => {
    const ok = Ok();
    const value = isOk(ok);

    expect(value).toBe(true);
  });

  it("should return false when Err is passed in", () => {
    const err = Err();
    const value = isOk(err);

    expect(value).toBe(false);
  });
});

describe("isOk [types]", () => {
  it("should narrow type via control flow inference for result type", () => {
    type Value = number;
    type Error = { code: string };

    const value = Create<Value, Error>("ok", 0xf);

    if (isOk(value)) {
      type Test = typeof value;
      type Expected = Ok<Value>;

      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }

    if (!isOk(value)) {
      type Test = typeof value;
      type Expected = Err<Error>;

      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }
  });

  it("should narrow type via control flow inference for result unknown type", () => {
    const value: unknown = null;

    if (isOk(value)) {
      type Test = typeof value;
      type Expected = Ok<unknown>;

      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }

    if (!isOk(value)) {
      type Test = typeof value;
      type Expected = unknown;

      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    }
  });
});
