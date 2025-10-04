import * as Vitest from "vitest";

import * as Text from "../index.js";

Vitest.describe("[runtime] Text.hasNoSpaces", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Text.hasNoSpaces).toBeDefined();
  });
});

Vitest.describe("[types] Text.hasNoSpaces", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Text.hasNoSpaces;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
