import * as Vitest from "vitest";

import * as Array from "../index.js";

Vitest.describe("[types] Array.NotEmpty", () => {
  Vitest.it("should be defined", () => {
    type Test = Array.NotEmpty<any>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
