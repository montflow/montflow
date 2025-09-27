import * as Vitest from "vitest";

import * as Result from "../index.js";

Vitest.describe("[runtime] Result.unwrap", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Result.unwrap).toBeDefined();
  });
});

Vitest.describe("[types] Result.unwrap", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Result.unwrap;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
