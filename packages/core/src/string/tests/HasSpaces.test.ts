import * as Vitest from "vitest";

import * as String from "../index.js";

Vitest.describe("[runtime] String.hasSpaces", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(String.hasSpaces).toBeDefined();
  });
});

Vitest.describe("[types] String.hasSpaces", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof String.hasSpaces;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
