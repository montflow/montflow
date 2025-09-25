import * as Vitest from "vitest";

import * as Array from "../index.js";

Vitest.describe("[runtime] Array.maybeLastIndex", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Array.maybeLastIndex).toBeDefined();
  });
});

Vitest.describe("[types] Array.maybeLastIndex", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Array.maybeLastIndex;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
