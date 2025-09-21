import * as Vitest from "vitest";

import * as Number from "../index.js";

Vitest.describe("[runtime] Number.Constructor", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Number.Constructor).toBeDefined();
  });
});

Vitest.describe("[types] Number.Constructor", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Number.Constructor;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
