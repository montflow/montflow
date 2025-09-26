import * as Vitest from "vitest";

import * as Range from "../index.js";

Vitest.describe("[types] Range.Tuple", () => {
  Vitest.it("should be defined", () => {
    type Test = Range.Tuple;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
