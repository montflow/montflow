import * as Vitest from "vitest";

import * as Macro from "../index.js";

Vitest.describe("[runtime] Macro.assert", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Macro.assert).toBeDefined();
  });
});

Vitest.describe("[types] Macro.assert", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Macro.assert;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
