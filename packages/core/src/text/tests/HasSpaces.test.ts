import * as Vitest from "vitest";

import * as Text from "../index.js";

Vitest.describe("[runtime] Text.hasSpaces", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Text.hasSpaces).toBeDefined();
  });
});

Vitest.describe("[types] Text.hasSpaces", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Text.hasSpaces;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
