import * as Vitest from "vitest";

import * as String from "../index.js";

Vitest.describe("[types] String.HasSpaces", () => {
  Vitest.it("should be defined", () => {
    type Test = String.HasSpaces<any>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
