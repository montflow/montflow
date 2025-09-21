import * as Vitest from "vitest";

import * as Array from "../index.js";

Vitest.describe.concurrent("[runtime] Array.Constructor", () => {
  Vitest.it.concurrent("should be defined", () => {
    Vitest.expect(Array.Constructor).toBeDefined();
  });
});

Vitest.describe("[types] Array.Constructor", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Array.Constructor;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
