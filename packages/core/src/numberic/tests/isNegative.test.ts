import * as Vitest from "vitest";

import * as Numeric from "../index.js";

Vitest.describe("[runtime] Numeric.isNegative", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Numeric.isNegative).toBeDefined();
  });
});

Vitest.describe("[types] Numeric.isNegative", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Numeric.isNegative;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
