import * as Vitest from "vitest";

import * as Number from "../index.js";

Vitest.describe("[runtime] Number.isNegative", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Number.isNegative).toBeDefined();
  });
});

Vitest.describe("[types] Number.isNegative", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Number.isNegative;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
