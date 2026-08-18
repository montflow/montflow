import * as Vitest from "vitest";

import * as Range from "../index.js";

Vitest.describe("[runtime] Range.max", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Range.max).toBeDefined();
  });
});

Vitest.describe("[types] Range.max", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Range.max;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
