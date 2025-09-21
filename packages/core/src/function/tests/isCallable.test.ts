import * as Vitest from "vitest";

import * as Function from "../index.js";

Vitest.describe("[runtime] Function.isCallable", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Function.isCallable).toBeDefined();
  });
});

Vitest.describe("[types] Function.isCallable", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Function.isCallable;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
