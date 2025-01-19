import { describe, expect, expectTypeOf, it } from "vitest";
import { nextPick } from "..";
import { isNone, isSome, Maybe } from "../../maybe";

describe("nextPick [runtime]", () => {
  it("should return Some with a random item from array", () => {
    const items = [1, 2, 3, 4, 5];
    const generator = () => 0.5; // Will pick middle item

    const result = nextPick(items, { generator });

    expect(isSome(result)).toBe(true);
    expect(result).toHaveProperty("value", 3);
  });

  it("should return None for empty array", () => {
    const items: number[] = [];
    const generator = () => 0.5;

    const result = nextPick(items, { generator });

    expect(isNone(result)).toBe(true);
  });

  it("should work with curried API", () => {
    const items = [1, 2, 3, 4, 5];
    const generator = () => 0.5;

    const result = nextPick({ generator })(items);

    expect(isSome(result)).toBe(true);
    expect(result).toHaveProperty("value", 3);
  });

  it("should work with iterables", () => {
    const items = new Set([1, 2, 3, 4, 5]);
    const generator = () => 0.5;

    const result = nextPick(items, { generator });

    expect(isSome(result)).toBe(true);
    expect(result).toHaveProperty("value", 3);
  });

  it("should return first item for generator returning 0", () => {
    const items = [1, 2, 3, 4, 5];
    const generator = () => 0;

    const result = nextPick(items, { generator });

    expect(isSome(result)).toBe(true);
    expect(result).toHaveProperty("value", 1);
  });

  it("should return last item for generator returning 0.99...", () => {
    const items = [1, 2, 3, 4, 5];
    const generator = () => 0.99999999;

    const result = nextPick(items, { generator });

    expect(isSome(result)).toBe(true);
    expect(result).toHaveProperty("value", 5);
  });

  it("should use Math.random as default generator", () => {
    const items = [1];

    const result = nextPick(items);

    console.log(result);

    expect(isSome(result)).toBe(true);
    expect(result).toHaveProperty("value", 1);
  });
});

describe("nextPick [types]", () => {
  it("should preserve item type in Maybe", () => {
    const items = ["a", "b", "c"];
    const generator = () => 0.5;

    const result = nextPick(items, { generator });

    type Test = typeof result;
    type Expected = Maybe<string>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should work with union types", () => {
    const items = [1, "two", 3, "four"];
    const generator = () => 0.5;

    const result = nextPick(items, { generator });

    type Test = typeof result;
    type Expected = Maybe<string | number>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });
});
