import * as Vitest from "vitest";

import * as Result from "../index.js";

Vitest.describe("[types] Result.Flatten", () => {
  Vitest.it("should be defined", () => {
    type Test = Result.Flatten<Result.Any>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
