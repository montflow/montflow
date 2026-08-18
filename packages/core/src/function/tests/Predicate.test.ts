import * as Vitest from "vitest";

import * as Function from "../index.js";

Vitest.describe("[types] Function.Predicate", () => {
  Vitest.it("should be defined", () => {
    type Test = Function.Predicate<number>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
