import * as Vitest from "vitest";

import * as String from "../index.js";

Vitest.describe("[types] String.IsNotEmpty", () => {
  Vitest.it("should be defined", () => {
    type Test = String.IsNotEmpty<"hello">;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
