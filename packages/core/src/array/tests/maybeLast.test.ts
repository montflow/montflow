import * as Vitest from "vitest";

import * as Array from "../index.js";

Vitest.describe("[runtime] Array.maybeLast", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Array.maybeLast).toBeDefined();
  });
});

Vitest.describe("[types] Array.maybeLast", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Array.maybeLast;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
