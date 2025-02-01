import { describe, expect, expectTypeOf, it } from "vitest";
import { keys } from "..";

describe("keys [runtime]", () => {
  it("should extract keys in data-first overload", () => {
    const obj = { prop1: "🎈", prop2: 0x0, prop3: true };

    const result = keys(obj);

    expect(result).toStrictEqual(["prop1", "prop2", "prop3"]);
  });

  it("should extract keys in curried version", () => {
    const obj = { prop1: "🎈", prop2: 0x0, prop3: true };

    const result = keys()(obj);

    expect(result).toStrictEqual(["prop1", "prop2", "prop3"]);
  });
});

describe("keys [types]", () => {
  it("should correctly infer the output type of array", () => {
    const input = { hello: "🎈", world: 0x0, ["!"]: true };
    const result = keys(input);

    type Test = typeof result;
    type Expected = ("hello" | "world" | "!")[];

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should correctly infer the output type of array for const objects", () => {
    const input = { hello: "🎈", world: 0x0, ["!"]: true } as const;
    const result = keys(input);

    type Test = typeof result;
    type Expected = ("hello" | "world" | "!")[];

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });
});
