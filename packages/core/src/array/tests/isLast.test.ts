import * as Vitest from "vitest";

import * as Array from "../index.js";

Vitest.describe("[runtime] Array.isLast", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Array.isLast).toBeDefined();
  });
});

Vitest.describe("[types] Array.isLast", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Array.isLast;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
