import * as Vitest from "vitest";

import * as Function from "../index.js";

Vitest.describe("[types] Function.Callback", () => {
  Vitest.it("should be defined", () => {
    type Test = Function.Callback;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
