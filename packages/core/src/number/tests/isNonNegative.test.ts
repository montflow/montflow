import * as Vitest from "vitest";

import * as Number from "../index.js";

Vitest.describe("[runtime] Number.isNonNegative", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Number.isNonNegative).toBeDefined();
  });
});

Vitest.describe("[types] Number.isNonNegative", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Number.isNonNegative;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
