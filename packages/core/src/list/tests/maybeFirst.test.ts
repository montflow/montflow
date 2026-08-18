import * as Vitest from "vitest";

import * as List from "../index.js";

Vitest.describe("[runtime] List.maybeFirst", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(List.maybeFirst).toBeDefined();
  });
});

Vitest.describe("[types] List.maybeFirst", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof List.maybeFirst;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
