import { describe, expect, expectTypeOf, it } from "vitest";
import { is, isNone, isSome, Maybe, None, Some } from "..";
import { pipe } from "../../common/pipe";
import { isNumber } from "../../number";

describe("is [runtime]", () => {
  it("should return original Maybe when Some and guard succeeds", () => {
    const inner = 10;
    const some = Some(inner);

    const value = is(isNumber)(some);

    expect(isSome(value)).toBe(true);
    if (isSome(value)) expect(value.value).toBe(inner);
  });

  it("should return None when Some and guard fails", () => {
    const inner = "";
    const some = Some(inner);

    const value = is(isNumber)(some);

    expect(isNone(value)).toBe(true);
  });

  it("should return None when None input", () => {
    const none = None();

    const value = is(isNumber)(none);

    expect(isNone(value)).toBe(true);
  });
});

describe("is [types]", () => {
  it("should cast to guarded type when Some input with known Inner type", () => {
    const inner: symbol = Symbol("test");
    const some = Some(inner);

    const value = pipe(some, is(isNumber));

    type Test = typeof value;
    type Expected = Maybe<number>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should cast to guarded type when Some input with unknown Inner type", () => {
    const inner: unknown = Symbol("test");
    const some = Some(inner);

    const value = pipe(some, is(isNumber));

    type Test = typeof value;
    type Expected = Maybe<number>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should cast to guarded type with input Maybe", () => {
    const inner: symbol = Symbol("test");
    const maybe = Some(inner);

    const value = pipe(maybe, is(isNumber));

    type Test = typeof value;
    type Expected = Maybe<number>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should cast to guarded type with None", () => {
    const none = None();

    const value = pipe(none, is(isNumber));

    type Test = typeof value;
    type Expected = Maybe<number>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });
});
