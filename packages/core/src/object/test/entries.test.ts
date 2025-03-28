import { describe, expect, expectTypeOf, it } from "vitest";
import * as Object from "../index.js";

describe("Object.entries [runtime]", () => {
  it("should extract entries in data-first overload", () => {
    const obj = { prop1: "🎈", prop2: 0x0, prop3: true };

    const result = Object.entries(obj);

    expect(result).toStrictEqual([
      ["prop1", "🎈"],
      ["prop2", 0x0],
      ["prop3", true],
    ]);
  });
});

describe("Object.entries [types]", () => {
  it("should correctly infer the output type of array", () => {
    const input = { hello: "🎈", world: 0x0, ["!"]: true };
    const result = Object.entries(input);

    type Test = typeof result;
    type Expected = (["hello", string] | ["world", number] | ["!", boolean])[];

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should correctly infer the output type of array for const objects", () => {
    const input = { hello: "🎈", world: 0x0, ["!"]: true } as const;
    const result = Object.entries(input);

    type Test = typeof result;
    type Expected = (["hello", "🎈"] | ["world", 0x0] | ["!", true])[];

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });
});

describe("Object.Entries [types]", () => {
  it("should correctly infer the entries type for a dictionary", () => {
    type Input = { hello: "🎈"; world: 0x0; ["!"]: true };
    type Result = Object.Entries<Input>;

    type Expected = ["hello", string] | ["world", number] | ["!", boolean];
    expectTypeOf<Result>().toMatchTypeOf<Expected>();
  });

  it("should correctly infer the entries type for a const dictionary", () => {
    const input = { hello: "🎈", world: 0x0, ["!"]: true } as const;
    type Result = Object.Entries<typeof input>;

    type Expected = ["hello", "🎈"] | ["world", 0x0] | ["!", true];
    expectTypeOf<Result>().toMatchTypeOf<Expected>();
  });

  it("should correctly infer the entries type for generic dictionary", () => {
    type Input = Record<string, number | number>;
    type Result = Object.Entries<Input>;

    type Expected = [string, number | number];
    expectTypeOf<Result>().toMatchTypeOf<Expected>();
  });

  it("should handle empty objects", () => {
    const input = {};
    type Result = Object.Entries<typeof input>;

    type Expected = never;
    expectTypeOf<Result>().toMatchTypeOf<Expected>();
  });

  it("should handle dictionaries with optional properties", () => {
    type Input = { a: number; b: string; c: boolean; d?: string[] };
    type Result = Object.Entries<Input>;

    type Expected =
      | ["a", number]
      | ["b", string]
      | ["c", boolean]
      | ["d", string[] | undefined];

    expectTypeOf<Result>().toMatchTypeOf<Expected>();
  });
});
