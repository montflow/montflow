import * as Vitest from "vitest";

import * as Number from "../index.js";

Vitest.describe("[runtime] Number.range", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Number.range).toBeDefined();
  });
});

Vitest.describe("[types] Number.range", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Number.range;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
