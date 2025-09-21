import * as Vitest from "vitest";

import * as Number from "../index.js";

Vitest.describe("[types] Number.Decrement", () => {
  Vitest.it("should be defined", () => {
    type Test = Number.Decrement<5>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
