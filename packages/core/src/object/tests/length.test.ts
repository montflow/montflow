import * as Vitest from "vitest";

import * as Object from "../index.js";

Vitest.describe("[runtime] Object.length", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Object.length).toBeDefined();
  });
});

Vitest.describe("[types] Object.length", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Object.length;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
