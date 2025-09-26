import * as Vitest from "vitest";

import * as String from "../index.js";

Vitest.describe("[runtime] String.isEmpty", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(String.isEmpty).toBeDefined();
  });
});

Vitest.describe("[types] String.isEmpty", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof String.isEmpty;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
