import * as Vitest from "vitest";

import * as Result from "../index.js";

Vitest.describe("[types] Result.Err", () => {
  Vitest.it("should be defined", () => {
    type Test = Result.Err<any>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
