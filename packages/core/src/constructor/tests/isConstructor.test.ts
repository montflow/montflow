import * as Vitest from "vitest";

import * as Constructor from "../index.js";

Vitest.describe("[runtime] Constructor.isConstructor", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Constructor.isConstructor).toBeDefined();
  });
});

Vitest.describe("[types] Constructor.isConstructor", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Constructor.isConstructor;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
