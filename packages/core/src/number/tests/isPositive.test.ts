import * as Vitest from "vitest";

import * as Number from "../index.js";

Vitest.describe("[runtime] Number.isPositive", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Number.isPositive).toBeDefined();
  });
});

Vitest.describe("[types] Number.isPositive", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Number.isPositive;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
