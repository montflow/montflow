import * as Vitest from "vitest";

import * as List from "../index.js";

Vitest.describe("[runtime] List.maybeLast", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(List.maybeLast).toBeDefined();
  });
});

Vitest.describe("[types] List.maybeLast", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof List.maybeLast;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
