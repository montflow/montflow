import * as Vitest from "vitest";

import * as Range from "../index.js";

Vitest.describe("[runtime] Range.InvalidRangeError", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Range.InvalidRangeError).toBeDefined();
  });
});

Vitest.describe("[types] Range.InvalidRangeError", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Range.InvalidRangeError;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
