import * as Vitest from "vitest";

import * as Macro from "../index.js";

Vitest.describe("[runtime] Macro.evaluate", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Macro.evaluate).toBeDefined();
  });
});

Vitest.describe("[types] Macro.evaluate", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Macro.evaluate;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
