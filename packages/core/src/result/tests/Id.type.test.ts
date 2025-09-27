import * as Vitest from "vitest";

import * as Result from "../index.js";

Vitest.describe("[types] Result.Id", () => {
  Vitest.it("should be defined", () => {
    type Test = Result.Id;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
