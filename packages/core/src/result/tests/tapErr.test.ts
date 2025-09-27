import * as Vitest from "vitest";

import * as Result from "../index.js";

Vitest.describe("[runtime] Result.tapErr", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Result.tapErr).toBeDefined();
  });
});

Vitest.describe("[types] Result.tapErr", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Result.tapErr;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
