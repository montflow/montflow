import * as Vitest from "vitest";

import * as Array from "../index.js";

Vitest.describe("[runtime] Array.lastIndex", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Array.lastIndex).toBeDefined();
  });
});

Vitest.describe("[types] Array.lastIndex", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Array.lastIndex;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
