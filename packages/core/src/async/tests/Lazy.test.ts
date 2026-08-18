import * as Vitest from "vitest";

import * as Async from "../index.js";

Vitest.describe("[types] Async.Lazy", () => {
  Vitest.it("should be defined", () => {
    type Test = Async.Lazy<string>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
