import * as Vitest from "vitest";

import * as List from "../index.js";

Vitest.describe("[runtime] List.maybeLastIndex", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(List.maybeLastIndex).toBeDefined();
  });
});

Vitest.describe("[types] List.maybeLastIndex", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof List.maybeLastIndex;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
