import * as Vitest from "vitest";

import * as Range from "../index.js";

Vitest.describe("[runtime] Range.symetric", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Range.symetric).toBeDefined();
  });
});

Vitest.describe("[types] Range.symetric", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Range.symetric;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
