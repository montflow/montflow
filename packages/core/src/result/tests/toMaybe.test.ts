import * as Vitest from "vitest";

import * as Result from "../index.js";

Vitest.describe("[runtime] Result.toMaybe", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Result.toMaybe).toBeDefined();
  });
});

Vitest.describe("[types] Result.toMaybe", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Result.toMaybe;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
