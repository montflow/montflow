import * as Vitest from "vitest";

import * as Result from "../index.js";

Vitest.describe("[runtime] Result.isOk", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Result.isOk).toBeDefined();
  });
});

Vitest.describe("[types] Result.isOk", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Result.isOk;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
