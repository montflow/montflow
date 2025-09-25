import * as Vitest from "vitest";

import * as Function from "../index.js";

Vitest.describe("[types] Function.Unary.Async", () => {
  Vitest.it("should be defined", () => {
    type Test = Function.Unary.Async<string, number>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
