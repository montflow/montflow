import * as Vitest from "vitest";

import * as Array from "../index.js";

Vitest.describe("[runtime] Array.last", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Array.last).toBeDefined();
  });
});

Vitest.describe("[types] Array.last", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Array.last;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
