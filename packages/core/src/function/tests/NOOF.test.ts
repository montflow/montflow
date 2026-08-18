import * as Vitest from "vitest";

import * as Function from "../index.js";

Vitest.describe("[runtime] Function.NOOF", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Function.NOOF).toBeDefined();
  });
});

Vitest.describe("[types] Function.NOOF", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Function.NOOF;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
