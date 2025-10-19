import * as Vitest from "vitest";

import * as Numeric from "../index.js";

Vitest.describe("[runtime] Numeric.isNonNegative", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Numeric.isNonNegative).toBeDefined();
  });
});

Vitest.describe("[types] Numeric.isNonNegative", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Numeric.isNonNegative;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
