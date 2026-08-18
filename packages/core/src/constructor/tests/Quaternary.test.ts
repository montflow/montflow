import * as Vitest from "vitest";

import * as Constructor from "../index.js";

Vitest.describe("[types] Constructor.Quaternary", () => {
  Vitest.it("should be defined", () => {
    type Test = Constructor.Quaternary<string, number, boolean, object, any>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
