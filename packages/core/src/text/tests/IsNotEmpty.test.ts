import * as Vitest from "vitest";

import * as Text from "../index.js";

Vitest.describe("[runtime] Text.isNotEmpty", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Text.isNotEmpty).toBeDefined();
  });
});

Vitest.describe("[types] Text.isNotEmpty", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Text.isNotEmpty;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
