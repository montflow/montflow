import * as Vitest from "vitest";

import * as Object from "../index.js";

Vitest.describe("[types] Object.Value", () => {
  Vitest.it("should be defined", () => {
    type Test = Object.Value<{ a: number }, "a">;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it("should correctly infer specified value type", () => {
    type Input = { one: string; two: "2"; three: boolean };

    type One = Object.Value<Input, "one">;
    type Two = Object.Value<Input, "two">;
    type Three = Object.Value<Input, "three">;

    Vitest.expectTypeOf<One>().toMatchTypeOf<Input["one"]>();
    Vitest.expectTypeOf<Two>().toMatchTypeOf<Input["two"]>();
    Vitest.expectTypeOf<Three>().toMatchTypeOf<Input["three"]>();
  });

  Vitest.it("should throw compiler error when provided with invalid property", () => {
    type Input = { one: string; two: "2"; three: boolean };

    // @ts-expect-error
    type Test = Object.Value<Input, "four">;
  });

  Vitest.it("should correctly infer type for generic objects", () => {
    type Input = Record<string, number>;

    type Test = Object.Value<Input, "any">;
    type Expected = number;

    Vitest.expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });
});
