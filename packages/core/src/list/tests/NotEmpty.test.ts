import * as Vitest from "vitest";

import * as List from "../index.js";

Vitest.describe("[types] List.NotEmpty", () => {
  Vitest.it("should be defined", () => {
    type Test = List.NotEmpty<any>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
