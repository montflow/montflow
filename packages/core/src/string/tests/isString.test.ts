import * as Vitest from "vitest";

import * as String from "../index.js";

Vitest.describe("[runtime] String.isString", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(String.isString).toBeDefined();
  });
});

Vitest.describe("[types] String.isString", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof String.isString;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
