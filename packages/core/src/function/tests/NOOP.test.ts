import * as Vitest from "vitest";

import * as Function from "../index.js";

Vitest.describe("[runtime] Function.NOOP", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Function.NOOP).toBeDefined();
  });
});

Vitest.describe("[types] Function.NOOP", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Function.NOOP;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
