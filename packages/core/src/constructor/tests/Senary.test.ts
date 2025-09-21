import * as Vitest from "vitest";

import * as Constructor from "../index.js";

Vitest.describe("[types] Constructor.Senary", () => {
  Vitest.it("should be defined", () => {
    type Test = Constructor.Senary<string, number, boolean, object, any, unknown, null>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
