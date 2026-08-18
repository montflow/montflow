import * as Vitest from "vitest";

import * as Maybe from "../index.js";

Vitest.describe("[runtime] Maybe.isNone", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Maybe.isNone).toBeDefined();
  });
});

Vitest.describe("[types] Maybe.isNone", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Maybe.isNone;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
