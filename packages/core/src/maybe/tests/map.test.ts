import * as Vitest from "vitest";

import * as Maybe from "../index.js";

Vitest.describe("[runtime] Maybe.map", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Maybe.map).toBeDefined();
  });
});

Vitest.describe("[types] Maybe.map", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Maybe.map;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
