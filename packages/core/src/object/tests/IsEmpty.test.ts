import * as Vitest from "vitest";

import * as Object from "../index.js";

Vitest.describe("[types] Object.IsEmpty", () => {
  Vitest.it("should be defined", () => {
    type Test = Object.IsEmpty<{}>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
