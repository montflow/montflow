import * as Vitest from "vitest";

import * as List from "../index.js";

Vitest.describe("[runtime] List.empty", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(List.empty).toBeDefined();
  });
});

Vitest.describe("[types] List.empty", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof List.empty;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
