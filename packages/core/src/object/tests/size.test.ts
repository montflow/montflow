import * as Vitest from "vitest";

import * as Object from "../index.js";

Vitest.describe("[runtime] Object.size", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Object.size).toBeDefined();
  });
});

Vitest.describe("[types] Object.size", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Object.size;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
