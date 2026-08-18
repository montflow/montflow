import * as Vitest from "vitest";

import * as Constructor from "../index.js";

Vitest.describe("[types] Constructor.Nullary", () => {
  Vitest.it("should be defined", () => {
    type Test = Constructor.Nullary<string>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
