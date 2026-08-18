import * as Vitest from "vitest";

import * as Result from "../index.js";

Vitest.describe("[runtime] Result.ErrTag", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Result.ErrTag).toBeDefined();
  });
});

Vitest.describe("[types] Result.ErrTag", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Result.ErrTag;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
