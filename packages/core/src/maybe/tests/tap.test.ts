import * as Vitest from "vitest";

import * as Maybe from "../index.js";

Vitest.describe("[runtime] Maybe.tap", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Maybe.tap).toBeDefined();
  });
});

Vitest.describe("[types] Maybe.tap", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Maybe.tap;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
