import * as Vitest from "vitest";

import * as Result from "../index.js";

Vitest.describe("[runtime] Result.MAX_UNFOLD_DEPTH", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Result.MAX_UNFOLD_DEPTH).toBeDefined();
  });
});

Vitest.describe("[types] Result.MAX_UNFOLD_DEPTH", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Result.MAX_UNFOLD_DEPTH;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
