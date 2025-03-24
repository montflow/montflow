import { describe, expect, expectTypeOf, it } from "vitest";
import * as Object from "../index.js";

describe("Object.keys [runtime]", () => {
  it("should extract Object.keys in data-first overload", () => {
    const obj = { prop1: "🎈", prop2: 0x0, prop3: true };

    const result = Object.keys(obj);

    expect(result).toStrictEqual(["prop1", "prop2", "prop3"]);
  });
});

describe("Object.keys [types]", () => {
  it("should correctly infer the output type of array", () => {
    const input = { hello: "🎈", world: 0x0, ["!"]: true };
    const result = Object.keys(input);

    type Test = typeof result;
    type Expected = ("hello" | "world" | "!")[];

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should correctly infer the output type of array for const objects", () => {
    const input = { hello: "🎈", world: 0x0, ["!"]: true } as const;
    const result = Object.keys(input);

    type Test = typeof result;
    type Expected = ("hello" | "world" | "!")[];

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });
});
