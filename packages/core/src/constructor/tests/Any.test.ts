import * as Vitest from "vitest";

import * as Constructor from "../index.js";

Vitest.describe("[types] Constructor.Any", () => {
  Vitest.it("should be defined", () => {
    type Test = Constructor.Any;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
