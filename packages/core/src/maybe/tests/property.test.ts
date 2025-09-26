import * as Vitest from "vitest";

import * as Maybe from "../index.js";

Vitest.describe("[runtime] Maybe.property", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Maybe.property).toBeDefined();
  });
});

Vitest.describe("[types] Maybe.property", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Maybe.property;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
