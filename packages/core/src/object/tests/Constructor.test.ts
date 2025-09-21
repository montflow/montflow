import * as Vitest from "vitest";

import * as Object from "../index.js";

Vitest.describe("[runtime] Object.Constructor", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Object.Constructor).toBeDefined();
  });
});

Vitest.describe("[types] Object.Constructor", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Object.Constructor;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
