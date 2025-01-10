import { describe, expect, expectTypeOf, it } from "vitest";
import { Create, ErrorOf, Flatten, InfiniteUnfold, isErr, isOk, Result, ValueOf } from "..";
import { Create as CreateNothing, Nothing } from "../../nothing";

describe("Result [runtime]", () => {
  it("should create empty Ok when passed in 'kind' of ok wo/ value", () => {
    const ok = Create("ok");

    expect(isOk(ok)).toBe(true);
    expect(ok).toHaveProperty("value", CreateNothing());
  });

  it("should create Ok when passed in 'kind' of ok and value", () => {
    const value = 0x100;
    const ok = Create("ok", value);

    expect(isOk(ok)).toBe(true);
    expect(ok).toHaveProperty("value", value);
  });

  it("should create empty Err when passed in 'kind' of err wo/ error", () => {
    const err = Create("err");

    expect(isErr(err)).toBe(true);
    expect(err).toHaveProperty("error", CreateNothing());
  });

  it("should create Err when passed in 'kind' or err and error", () => {
    const error = "custom error";
    const err = Create("err", error);

    expect(isErr(err)).toBe(true);
    expect(err).toHaveProperty("error", error);
  });
});

describe("Result [types]", () => {
  it("should be type Result<Nothing, Nothing> when passed in 'kind' ok with no value", () => {
    const result = Create("err");

    type Test = typeof result;
    type Expected = Result<Nothing, Nothing>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should be type Result<Nothing, Nothing> when passed in 'kind' err with no error", () => {
    const result = Create("err");

    type Test = typeof result;
    type Expected = Result<Nothing, Nothing>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should be type Result<Value, Nothing> when passed in 'kind' ok with value", () => {
    type Value = string;

    const value: Value = "str";
    const result = Create("ok", value);

    type Test = typeof result;
    type Expected = Result<Value, Nothing>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should be type Result<Nothing, Error> when passed in 'kind' err with error", () => {
    type Error = boolean;

    const error: Error = true;
    const result = Create("err", error);

    type Test = typeof result;
    type Expected = Result<Nothing, Error>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should be type Result<Value, Error> when passed in 'kind' ok with value and Error template argument", () => {
    type Value = number;
    type Error = string;

    const value: Value = 0xf;
    const result = Create<Value, Error>("ok", value);

    type Test = typeof result;
    type Expected = Result<Value, Error>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should be type Result<Value, Error> when passed in 'kind' err with error and Value template argument", () => {
    type Value = boolean;
    type Error = string;

    const error: Error = "👽";
    const result = Create<Value, Error>("err", error);

    type Test = typeof result;
    type Expected = Result<Value, Error>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  describe("OkOf", () => {
    it("should extract the Ok value from result", () => {
      type OkValue = number;
      type ResultType = Result<OkValue, never>;
      type Test = ValueOf<ResultType>;

      expectTypeOf<Test>().toMatchTypeOf<OkValue>();
    });
  });

  describe("ErrOf", () => {
    it("should extract the Err value from result", () => {
      type ErrValue = number;
      type ResultType = Result<never, ErrValue>;
      type Test = ErrorOf<ResultType>;

      expectTypeOf<Test>().toMatchTypeOf<ErrValue>();
    });
  });

  describe("Flatten", () => {
    it("should return the original result if not nested", () => {
      type Expected = Result<boolean, string>;
      type Test = Flatten<Expected>;

      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    });

    it("should return the nested result type w/ union of Err", () => {
      type NestedOk = string;
      type NestedErr = "nested err";
      type Nested = Result<NestedOk, NestedErr>;

      type RootErr = "rootErr";
      type Root = Result<Nested, RootErr>;

      type Test = Flatten<Root>;
      type Expected = Result<NestedOk, NestedErr | RootErr>;

      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    });
  });

  describe("Unfold", () => {
    it("should just return the origin result if not nested", () => {
      type Expected = Result<string, boolean>;
      type Test = InfiniteUnfold<Expected>;

      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    });

    it("should infer the inner nested result @ depth 1", () => {
      type InOk = number;
      type InErr = string;
      type InResult = Result<InOk, InErr>;

      type OutErr = boolean;
      type OutResult = Result<InResult, OutErr>;

      type Test = InfiniteUnfold<OutResult>;

      expectTypeOf<Test>().toMatchTypeOf<Result<InOk, InErr | OutErr>>();
    });

    it("should infer the inner nested result @ depth 8", () => {
      type Inner = number;

      type Err1 = "error 1";
      type Result1 = Result<Inner, Err1>;

      type Ok2 = Result1;
      type Err2 = "error 2";
      type Result2 = Result<Ok2, Err2>;

      type Ok3 = Result2;
      type Err3 = "error 3";
      type Result3 = Result<Ok3, Err4>;

      type Ok4 = Result3;
      type Err4 = "error 4";
      type Result4 = Result<Ok4, Err4>;

      type Ok5 = Result4;
      type Err5 = "error 5";
      type Result5 = Result<Ok5, Err5>;

      type Ok6 = Result5;
      type Err6 = "error 6";
      type Result6 = Result<Ok6, Err6>;

      type Ok7 = Result6;
      type Err7 = "error 7";
      type Result7 = Result<Ok7, Err7>;

      type Ok8 = Result7;
      type Err8 = "error 8";
      type Result8 = Result<Ok8, Err8>;

      type Test = InfiniteUnfold<Result8>;
      type Expected = Result<Inner, Err1 | Err2 | Err3 | Err4 | Err5 | Err6 | Err7 | Err8>;

      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    });
  });
});
