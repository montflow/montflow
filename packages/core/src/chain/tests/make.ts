import * as Vitest from "vitest";

import * as Chain from "../index.js";

Vitest.describe("[runtime] Chain.make", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Chain.make).toBeDefined();
  });
});

Vitest.describe("[types] Constructor.isConstructor", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Chain.make;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
