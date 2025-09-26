import * as Vitest from "vitest";

import * as String from "../index.js";

Vitest.describe("[runtime] String.hasNoSpaces", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(String.hasNoSpaces).toBeDefined();
  });
});

Vitest.describe("[types] String.hasNoSpaces", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof String.hasNoSpaces;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
