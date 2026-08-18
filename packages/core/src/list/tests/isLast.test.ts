import * as Vitest from "vitest";

import * as List from "../index.js";

Vitest.describe("[runtime] List.isLast", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(List.isLast).toBeDefined();
  });
});

Vitest.describe("[types] List.isLast", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof List.isLast;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
