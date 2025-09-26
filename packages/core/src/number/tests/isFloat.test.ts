import * as Vitest from "vitest";

import * as Number from "../index.js";

Vitest.describe("[runtime] Number.isFloat", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Number.isFloat).toBeDefined();
  });
});

Vitest.describe("[types] Number.isFloat", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Number.isFloat;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
