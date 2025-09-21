import * as Vitest from "vitest";

import * as Constructor from "../index.js";

Vitest.describe("[types] Constructor.Quinary", () => {
  Vitest.it("should be defined", () => {
    type Test = Constructor.Quinary<string, number, boolean, object, any, unknown>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
