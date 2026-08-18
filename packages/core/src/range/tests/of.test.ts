import * as Vitest from "vitest";

import * as Range from "../index.js";

Vitest.describe("[runtime] Range.of", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Range.of).toBeDefined();
  });
});

Vitest.describe("[types] Range.of", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Range.of;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
