import * as Vitest from "vitest";

import * as Result from "../index.js";

Vitest.describe("[runtime] Result.map", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Result.map).toBeDefined();
  });
});

Vitest.describe("[types] Result.map", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Result.map;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
