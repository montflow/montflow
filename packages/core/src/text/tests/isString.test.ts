import * as Vitest from "vitest";

import * as Text from "../index.js";

Vitest.describe("[runtime] Text.isString", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Text.isString).toBeDefined();
  });
});

Vitest.describe("[types] Text.isString", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Text.isString;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
