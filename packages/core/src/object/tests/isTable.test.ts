import * as Vitest from "vitest";

import * as Object from "../index.js";

Vitest.describe("[runtime] Object.isTable", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Object.isTable).toBeDefined();
  });
});

Vitest.describe("[types] Object.isTable", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Object.isTable;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
