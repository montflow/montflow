import * as Vitest from "vitest";

import * as Text from "../index.js";

Vitest.describe("[types] Text.HasSpaces", () => {
  Vitest.it("should be defined", () => {
    type Test = Text.HasSpaces<any>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
