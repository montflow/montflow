import * as Vitest from "vitest";

import * as String from "../index.js";

Vitest.describe("[types] String.IsEmpty", () => {
  Vitest.it("should be defined", () => {
    type Test = String.IsEmpty<any>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
