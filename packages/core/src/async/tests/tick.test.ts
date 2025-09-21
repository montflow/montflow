import * as Vitest from "vitest";

import * as Async from "../index.js";

Vitest.describe.concurrent("[runtime] Async.tick", () => {
  Vitest.it.concurrent("should be defined", () => {
    Vitest.expect(Async.tick).toBeDefined();
  });
});

Vitest.describe("[types] Async.tick", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Async.tick;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
