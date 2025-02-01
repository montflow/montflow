import { describe, expect, expectTypeOf, it } from "vitest";
import { values } from "..";

describe("values [runtime]", () => {
  it("should extract values in data-first overload", () => {
    const obj = { prop1: "🎈", prop2: 0x0, prop3: true };

    const result = values(obj);

    expect(result).toStrictEqual(["🎈", 0x0, true]);
  });

  it("should extract values in curried version", () => {
    const obj = { prop1: "🎈", prop2: 0x0, prop3: true };

    const result = values()(obj);

    expect(result).toStrictEqual(["🎈", 0x0, true]);
  });
});

describe("values [types]", () => {
  it("should correctly infer the output type of array", () => {
    const input = { hello: "🎈", world: 0x0, ["!"]: true };
    const result = values(input);

    type Test = typeof result;
    type Expected = (string | number | boolean)[];

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should correctly infer the output type of array for const objects", () => {
    const input = { hello: "🎈", world: 0x0, ["!"]: true } as const;
    const result = values(input);

    type Test = typeof result;
    type Expected = ("🎈" | 0x0 | true)[];

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });
});
