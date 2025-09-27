import * as Vitest from "vitest";

import * as Result from "../index.js";

Vitest.describe("[runtime] Result.UnwrapError", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Result.UnwrapError).toBeDefined();
  });
});

Vitest.describe("[types] Result.UnwrapError", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Result.UnwrapError;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
