import { describe, expectTypeOf, it } from "vitest";
import * as Object from "../index.js";

describe("Object.Value [types]", () => {
  it("should correctly infer specified value type", () => {
    type Input = { one: string; two: "2"; three: boolean };

    type One = Object.Value<Input, "one">;
    type Two = Object.Value<Input, "two">;
    type Three = Object.Value<Input, "three">;

    expectTypeOf<One>().toMatchTypeOf<Input["one"]>;
    expectTypeOf<Two>().toMatchTypeOf<Input["two"]>;
    expectTypeOf<Three>().toMatchTypeOf<Input["three"]>;
  });

  it("should throw compiler error when provided with invalid property", () => {
    type Input = { one: string; two: "2"; three: boolean };

    // @ts-expect-error
    type Test = Object.Value<Input, "four">;
  });

  it("should correctly infer type for generic objects", () => {
    type Input = Record<string, number>;

    type Test = Object.Value<Input, "any">;
    type Expected = number;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });
});
