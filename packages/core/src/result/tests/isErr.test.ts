import * as Vitest from "vitest";

import * as Result from "../index.js";

Vitest.describe("[runtime] Result.isErr", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Result.isErr).toBeDefined();
  });
});

Vitest.describe("[types] Result.isErr", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Result.isErr;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
