import * as Vitest from "vitest";

import * as Range from "../index.js";

Vitest.describe("[runtime] Range.toTuple", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Range.toTuple).toBeDefined();
  });
});

Vitest.describe("[types] Range.toTuple", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Range.toTuple;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
