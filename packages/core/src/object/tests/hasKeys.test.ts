import * as Vitest from "vitest";

import * as Object from "../index.js";

Vitest.describe("[runtime] Object.hasKeys", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Object.hasKeys).toBeDefined();
  });
});

Vitest.describe("[types] Object.hasKeys", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Object.hasKeys;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
