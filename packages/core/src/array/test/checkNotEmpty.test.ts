import { describe, expect, expectTypeOf, it } from "vitest";
import { checkNotEmpty, NotEmpty } from "..";
import { isNone, isSome, Maybe } from "../../maybe";

describe("idk [runtime]", () => {
  it("should return Some with non-empty array for non-empty inputs", () => {
    const initial = [1, 2, 3];
    const value = checkNotEmpty(initial);

    expect(isSome(value)).toBe(true);
    expect(value).toHaveProperty("value", initial);
  });

  it("should return None for empty array inputs", () => {
    const empty: number[] = [];
    const value = checkNotEmpty(empty);

    expect(isNone(value)).toBe(true);
  });

  it("should work with different array types", () => {
    const strings = ["a", "b", "c"];
    const objects = [{ id: 1 }, { id: 2 }];

    expect(isSome(checkNotEmpty(strings))).toBe(true);
    expect(isSome(checkNotEmpty(objects))).toBe(true);
    expect(isNone(checkNotEmpty([]))).toBe(true);
  });
});

describe("idk [types]", () => {
  it("should return Maybe of NotEmpty type", () => {
    const arr = [1, 2, 3];
    const value = checkNotEmpty(arr);

    type Test = typeof value;
    type Expected = Maybe<NotEmpty<number>>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });
});
