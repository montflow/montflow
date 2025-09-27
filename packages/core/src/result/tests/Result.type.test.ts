import * as Vitest from "vitest";

import * as Result from "../index.js";

Vitest.describe("[types] Result.Result", () => {
  Vitest.it("should be defined", () => {
    type Test = Result.Result<any, any>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
