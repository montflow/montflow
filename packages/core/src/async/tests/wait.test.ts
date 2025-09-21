import * as Vitest from "vitest";

import * as Async from "../index.js";

Vitest.describe.concurrent("[runtime] Async.wait", () => {
  Vitest.it.concurrent("should be defined", () => {
    Vitest.expect(Async.wait).toBeDefined();
  });
});

Vitest.describe("[types] Async.wait", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Async.wait;

    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
