import * as Vitest from "vitest";

import * as Maybe from "../index.js";

Vitest.describe("[runtime] Maybe.isSome", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Maybe.isSome).toBeDefined();
  });
});

Vitest.describe("[types] Maybe.isSome", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Maybe.isSome;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
