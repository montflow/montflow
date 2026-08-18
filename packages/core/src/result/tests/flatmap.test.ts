import * as Vitest from "vitest";

import * as Result from "../index.js";

Vitest.describe("[runtime] Result.flatmap", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Result.flatmap).toBeDefined();
  });
});

Vitest.describe("[types] Result.flatmap", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Result.flatmap;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
