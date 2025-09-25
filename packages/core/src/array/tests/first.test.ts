import * as Vitest from "vitest";

import * as Array from "../index.js";

Vitest.describe("[runtime] Array.first", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Array.first).toBeDefined();
  });
});

Vitest.describe("[types] Array.first", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Array.first;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
