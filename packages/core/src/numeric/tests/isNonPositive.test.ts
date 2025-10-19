import * as Vitest from "vitest";

import * as Numeric from "../index.js";

Vitest.describe("[runtime] Numeric.isNonPositive", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Numeric.isNonPositive).toBeDefined();
  });
});

Vitest.describe("[types] Numeric.isNonPositive", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Numeric.isNonPositive;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
