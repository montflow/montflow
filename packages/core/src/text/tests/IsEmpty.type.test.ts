import * as Vitest from "vitest";

import * as Text from "../index.js";

Vitest.describe("[types] Text.IsEmpty", () => {
  Vitest.it("should be defined", () => {
    type Test = Text.IsEmpty<any>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
