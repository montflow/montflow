import * as Vitest from "vitest";

import * as Macro from "../index.js";

Vitest.describe("[runtime] Macro.unknown", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Macro.unknown).toEqual(void 0);
  });
});

Vitest.describe("[types] Macro.unknown", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Macro.unknown;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
