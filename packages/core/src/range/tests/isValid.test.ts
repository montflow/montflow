import * as Vitest from "vitest";

import * as Range from "../index.js";

Vitest.describe("[runtime] Range.isValid", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Range.isValid).toBeDefined();
  });
});

Vitest.describe("[types] Range.isValid", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Range.isValid;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
