import * as Vitest from "vitest";

import * as Range from "../index.js";

Vitest.describe("[runtime] Range.isObject", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Range.isObject).toBeDefined();
  });
});

Vitest.describe("[types] Range.isObject", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Range.isObject;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
