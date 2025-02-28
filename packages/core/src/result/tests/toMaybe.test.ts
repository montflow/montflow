import { describe, expect, expectTypeOf, it } from "vitest";
import * as Maybe from "../../maybe/index.js";
import * as Result from "../index.js";

describe("toMaybe [runtime]", () => {
  it("should return Some when input is Ok", () => {
    const inner: string = "value";
    const result = Result.ok(inner);

    const maybe = Result.toMaybe()(result);

    expect(maybe).toEqual(Maybe.some(inner));
  });

  it("should return None when input is Err", () => {
    const error: string = "error";
    const result = Result.err<string>(error);

    const maybe = Result.toMaybe()(result);

    expect(maybe).toEqual(Maybe.none());
  });

  it("should preserve the Ok value type in Some", () => {
    const inner: number = 42;
    const result = Result.ok(inner);

    const maybe = Result.toMaybe()(result);

    expect(maybe).toEqual(Maybe.some(inner));
  });

  it("should return None regardless of Err value type", () => {
    const error: number = 404;
    const result = Result.err<number>(error);

    const maybe = Result.toMaybe()(result);

    expect(maybe).toEqual(Maybe.none());
  });
});

describe("toMaybe [types]", () => {
  it("should correctly infer the Maybe type for Ok", () => {
    const result = Result.ok("value");

    const maybe = Result.toMaybe<Result.ValueOf<typeof result>>()(result);

    type Test = typeof maybe;
    type Expected = Maybe.Maybe<string>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should correctly infer the Maybe type for Err", () => {
    const result = Result.ok<number>(404);

    const maybe = Result.toMaybe<Result.ValueOf<typeof result>>()(result);

    type Test = typeof maybe;
    type Expected = Maybe.Maybe<number>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should correctly handle complex Ok types", () => {
    const result = Result.ok({ foo: "bar", baz: 42 });

    const maybe = Result.toMaybe<Result.ValueOf<typeof result>>()(result);

    type Test = typeof maybe;
    type Expected = Maybe.Maybe<{ foo: string; baz: number }>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });
});
