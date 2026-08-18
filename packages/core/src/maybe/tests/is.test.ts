import * as Vitest from "vitest";

import * as Maybe from "../index.js";

Vitest.describe("[runtime] Maybe.is", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Maybe.is).toBeDefined();
  });
});

Vitest.describe("[types] Maybe.is", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Maybe.is;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
