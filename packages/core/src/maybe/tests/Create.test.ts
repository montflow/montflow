import { describe, expect, expectTypeOf, it } from "vitest";
import { Any, Create, Maybe, None, Some, SomeOf, Unfold } from "..";
import { Nothing } from "../../nothing";

describe("Maybe [runtime]", () => {
  it("should return None when no argument is provided", () => {
    const maybe = Create();

    expect(maybe.some).toBe(false);
  });

  it("should return Some when argument is provided", () => {
    const inner = 0xf;
    const value = Create(inner);

    expect(value.some).toBe(true);
    expect(value).toHaveProperty("value", inner);
  });
});

describe("Maybe [types]", () => {
  it("should be Maybe<T> when no argument is provided", () => {
    const value = Create<Inner>();
    type Inner = number;
    type Test = typeof value;

    expectTypeOf<Test>().toMatchTypeOf<Maybe<Inner>>();
  });
  it("should be Maybe<T> when argument is provided", () => {
    const inner: string = "test";
    const value = Create<Inner>();
    type Inner = typeof inner;
    type Test = typeof value;

    expectTypeOf<Test>().toMatchTypeOf<Maybe<Inner>>();
  });

  describe("SomeOf", () => {
    it("should infer the inner type of maybe", () => {
      type Inner = number;
      type Value = Maybe<Inner>;
      type Test = SomeOf<Value>;

      expectTypeOf<Test>().toMatchTypeOf<Inner>();
    });

    it("should only accept maybe types", () => {
      type NotMaybe = null;

      // @ts-expect-error
      type Test = SomeOf<NotMaybe>;
    });

    it("should infer the inner type of ok", () => {
      type Inner = number;
      type Value = Maybe<Inner>;
      type Test = SomeOf<Value>;

      expectTypeOf<Test>().toMatchTypeOf<Inner>();
    });

    it("should infer never on type of none", () => {
      type Value = None;
      type Test = SomeOf<Value>;

      expectTypeOf<Test>().toMatchTypeOf<never>();
    });
  });

  describe("Any", () => {
    it("should extend empty maybe", () => {
      type Value = Maybe<Nothing>;

      type Test = Value extends Any ? true : false;

      expectTypeOf<Test>().toMatchTypeOf<true>();
    });

    it("should extends to a variety of maybes", () => {
      type Value01 = Maybe<number>;
      type Value02 = Maybe<"true">;
      type Value03 = Maybe<{ a: string; b: boolean }>;
      type Value04 = Maybe<null>;
      type Value05 = Maybe<unknown>;

      type TestOf<T> = T extends Any ? true : false;

      expectTypeOf<TestOf<Value01>>().toMatchTypeOf<true>();
      expectTypeOf<TestOf<Value02>>().toMatchTypeOf<true>();
      expectTypeOf<TestOf<Value03>>().toMatchTypeOf<true>();
      expectTypeOf<TestOf<Value04>>().toMatchTypeOf<true>();
      expectTypeOf<TestOf<Value05>>().toMatchTypeOf<true>();
    });

    it("should extends any Some", () => {
      type Some01 = Some<number>;
      type Some02 = Some<string>;
      type Some03 = Some<Error>;
      type Some04 = Some<undefined>;
      type Some05 = Some<unknown>;

      type TestOf<T> = T extends Any ? true : false;

      expectTypeOf<TestOf<Some01>>().toMatchTypeOf<true>();
      expectTypeOf<TestOf<Some02>>().toMatchTypeOf<true>();
      expectTypeOf<TestOf<Some03>>().toMatchTypeOf<true>();
      expectTypeOf<TestOf<Some04>>().toMatchTypeOf<true>();
      expectTypeOf<TestOf<Some05>>().toMatchTypeOf<true>();
    });

    it("should extends None", () => {
      type Value = None;

      type Test = Value extends Any ? true : false;

      expectTypeOf<Test>().toMatchTypeOf<true>();
    });
  });

  describe("Flatten", () => {
    it("should infer the original maybe if not nested", () => {});
  });

  describe("Unfold", () => {
    it("should infer the inner nested type @ depth 1", () => {
      type Inner = number;
      type Expected = Maybe<Inner>;
      type M1 = Maybe<Expected>;
      type Test = Unfold<M1>;

      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    });

    it("should infer the inner nested type @ depth 2", () => {
      type Inner = number;
      type Expected = Maybe<Inner>;
      type M1 = Maybe<Expected>;
      type M2 = Maybe<M1>;
      type Test = Unfold<M2>;

      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    });

    it("should infer the inner nested type @ depth 8", () => {
      type Inner = number;
      type Expected = Maybe<Inner>;
      type M1 = Maybe<Expected>;
      type M2 = Maybe<M1>;
      type M3 = Maybe<M2>;
      type M4 = Maybe<M3>;
      type M5 = Maybe<M4>;
      type M6 = Maybe<M5>;
      type M7 = Maybe<M6>;
      type M8 = Maybe<M7>;

      type Test = Unfold<M8>;

      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    });

    it("should be some on some type", () => {
      type Inner = string;
      type Value = Some<Inner>;
      type Test = Unfold<Value>;
      type Expected = Value;

      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    });

    it("should be some on nested maybe type @ depth 1", () => {
      type Inner = boolean;
      type Value = Some<Inner>;
      type M1 = Maybe<Value>;
      type Test = Unfold<M1>;
      type Expected = Some<Inner>;

      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    });

    it("should be some on nested some type @ depth 1", () => {
      type Inner = boolean;
      type Value = Some<Inner>;
      type M1 = Some<Value>;
      type Test = Unfold<M1>;
      type Expected = Some<Inner>;

      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    });

    it("should be some on nested maybe type @ depth 2", () => {
      type Inner = Object;
      type Value = Some<Inner>;
      type M1 = Maybe<Value>;
      type M2 = Maybe<M1>;
      type Test = Unfold<M2>;
      type Expected = Value;

      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    });

    it("should be some on nested so type @ depth 2", () => {
      type Inner = Object;
      type Value = Some<Inner>;
      type M1 = Some<Value>;
      type M2 = Some<M1>;
      type Test = Unfold<M2>;
      type Expected = Value;

      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    });

    it("should be none on none type", () => {
      type Value = None;
      type Test = Unfold<Value>;
      type Expected = Value;

      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    });

    it("should be none on nested maybe type @ depth 1", () => {
      type Value = None;
      type M1 = Maybe<Value>;
      type Test = Unfold<M1>;
      type Expected = Value;

      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    });

    it("should be none on nested maybe type @ depth 2", () => {
      type Value = None;
      type M1 = Maybe<Value>;
      type M2 = Maybe<M1>;
      type Test = Unfold<M2>;
      type Expected = Value;

      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    });

    it("should be none on nested maybe type @ depth 8", () => {
      type Value = None;
      type M1 = Maybe<Value>;
      type M2 = Maybe<M1>;
      type M3 = Maybe<M2>;
      type M4 = Maybe<M3>;
      type M5 = Maybe<M4>;
      type M6 = Maybe<M5>;
      type M7 = Maybe<M6>;
      type M8 = Maybe<M7>;
      type Test = Unfold<M8>;
      type Expected = Value;

      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    });

    it("should be none on nested some type @ depth 8", () => {
      type Value = None;
      type M1 = Some<Value>;
      type M2 = Some<M1>;
      type M3 = Some<M2>;
      type M4 = Some<M3>;
      type M5 = Some<M4>;
      type M6 = Some<M5>;
      type M7 = Some<M6>;
      type M8 = Some<M7>;
      type Test = Unfold<M8>;
      type Expected = Value;

      expectTypeOf<Test>().toMatchTypeOf<Expected>();
    });
  });
});
