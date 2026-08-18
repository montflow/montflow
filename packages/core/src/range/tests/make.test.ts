import * as Vitest from "vitest";

import * as Range from "../index.js";

Vitest.describe("[runtime] Range.make", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Range.make).toBeDefined();
  });
});

Vitest.describe("[types] Range.make", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Range.make;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
