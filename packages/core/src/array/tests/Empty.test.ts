import * as Vitest from "vitest";

import * as Array from "../index.js";

Vitest.describe("[types] Array.Empty", () => {
  Vitest.it("should be defined", () => {
    type Test = Array.Empty<any>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
