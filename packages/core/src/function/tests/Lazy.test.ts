import * as Vitest from "vitest";

import * as Function from "../index.js";

Vitest.describe("[types] Function.Lazy", () => {
  Vitest.it("should be defined", () => {
    type Test = Function.Lazy;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
