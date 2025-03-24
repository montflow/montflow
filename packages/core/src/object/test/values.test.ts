import { describe, expect, expectTypeOf, it } from "vitest";
import * as Object from "../index.js";

describe("Object.values [runtime]", () => {
  it("should extract Object.values in data-first overload", () => {
    const obj = { prop1: "🎈", prop2: 0x0, prop3: true };

    const result = Object.values(obj);

    expect(result).toStrictEqual(["🎈", 0x0, true]);
  });
});

describe("Object.values [types]", () => {
  it("should correctly infer the output type of array", () => {
    const input = { hello: "🎈", world: 0x0, ["!"]: true };
    const result = Object.values(input);

    type Test = typeof result;
    type Expected = (string | number | boolean)[];

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should correctly infer the output type of array for const objects", () => {
    const input = { hello: "🎈", world: 0x0, ["!"]: true } as const;
    const result = Object.values(input);

    type Test = typeof result;
    type Expected = ("🎈" | 0x0 | true)[];

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });
});
