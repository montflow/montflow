import * as Vitest from "vitest";

import * as Array from "../index.js";

Vitest.describe("[runtime] Array.maybeFirst", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Array.maybeFirst).toBeDefined();
  });
});

Vitest.describe("[types] Array.maybeFirst", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Array.maybeFirst;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
