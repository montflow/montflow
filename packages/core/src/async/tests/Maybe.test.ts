import * as Vitest from "vitest";

import * as Async from "../index.js";

Vitest.describe("[types] Async.Maybe", () => {
  Vitest.it("should be defined", () => {
    type Test = Async.Maybe<string>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
