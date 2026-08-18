import * as Vitest from "vitest";

import * as List from "../index.js";

Vitest.describe("[runtime] List.lastIndex", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(List.lastIndex).toBeDefined();
  });
});

Vitest.describe("[types] List.lastIndex", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof List.lastIndex;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
