import * as Vitest from "vitest";

import * as Range from "../index.js";

Vitest.describe("[runtime] Range.isTuple", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Range.isTuple).toBeDefined();
  });
});

Vitest.describe("[types] Range.isTuple", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Range.isTuple;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
