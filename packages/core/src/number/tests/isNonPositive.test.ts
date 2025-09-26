import * as Vitest from "vitest";

import * as Number from "../index.js";

Vitest.describe("[runtime] Number.isNonPositive", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Number.isNonPositive).toBeDefined();
  });
});

Vitest.describe("[types] Number.isNonPositive", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Number.isNonPositive;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
