import * as Vitest from "vitest";

import * as Array from "../index.js";

Vitest.describe("[runtime] Array.isLastIndex", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Array.isLastIndex).toBeDefined();
  });
});

Vitest.describe("[types] Array.isLastIndex", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Array.isLastIndex;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
