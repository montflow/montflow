import * as Vitest from "vitest";

import * as Function from "../index.js";

Vitest.describe("[types] Function.Callable", () => {
  Vitest.it("should be defined", () => {
    type Test = Function.Callable;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
