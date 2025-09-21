import * as Vitest from "vitest";

import * as Macro from "../index.js";

Vitest.describe("[runtime] Macro.singleton", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Macro.singleton).toBeDefined();
  });
});

Vitest.describe("[types] Macro.singleton", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Macro.singleton;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
