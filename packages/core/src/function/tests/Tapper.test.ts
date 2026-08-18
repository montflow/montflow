import * as Vitest from "vitest";

import * as Function from "../index.js";

Vitest.describe("[types] Function.Tapper", () => {
  Vitest.it("should be defined", () => {
    type Test = Function.Tapper<string>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
