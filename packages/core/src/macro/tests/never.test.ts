import * as Vitest from "vitest";

import * as Macro from "../index.js";

Vitest.describe("[runtime] Macro.never", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Macro.never).toEqual(void 0);
  });
});

Vitest.describe("[types] Macro.never", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Macro.never;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
