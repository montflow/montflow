import * as Vitest from "vitest";

import * as Macro from "../index.js";

Vitest.describe("[runtime] Macro.todo", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Macro.todo).toBeDefined();
  });
});

Vitest.describe("[types] Macro.todo", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Macro.todo;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
