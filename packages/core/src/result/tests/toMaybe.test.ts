import { describe, expect, expectTypeOf, it } from "vitest";
import { Maybe, None, Some } from "../../maybe";
import { Err, Ok, ValueOf, toMaybe } from "../../result";

describe("toMaybe [runtime]", () => {
  it("should return Some when input is Ok", () => {
    const inner: string = "value";
    const result = Ok(inner);

    const maybe = toMaybe()(result);

    expect(maybe).toEqual(Some(inner));
  });

  it("should return None when input is Err", () => {
    const error: string = "error";
    const result = Err<string>(error);

    const maybe = toMaybe()(result);

    expect(maybe).toEqual(None());
  });

  it("should preserve the Ok value type in Some", () => {
    const inner: number = 42;
    const result = Ok(inner);

    const maybe = toMaybe()(result);

    expect(maybe).toEqual(Some(inner));
  });

  it("should return None regardless of Err value type", () => {
    const error: number = 404;
    const result = Err<number>(error);

    const maybe = toMaybe()(result);

    expect(maybe).toEqual(None());
  });
});

describe("toMaybe [types]", () => {
  it("should correctly infer the Maybe type for Ok", () => {
    const result = Ok("value");

    const maybe = toMaybe<ValueOf<typeof result>>()(result);

    type Test = typeof maybe;
    type Expected = Maybe<string>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should correctly infer the Maybe type for Err", () => {
    const result = Err<number>(404);

    const maybe = toMaybe<ValueOf<typeof result>>()(result);

    type Test = typeof maybe;
    type Expected = Maybe<string>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should correctly handle complex Ok types", () => {
    const result = Ok({ foo: "bar", baz: 42 });

    const maybe = toMaybe<ValueOf<typeof result>>()(result);

    type Test = typeof maybe;
    type Expected = Maybe<{ foo: string; baz: number }>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });
});
