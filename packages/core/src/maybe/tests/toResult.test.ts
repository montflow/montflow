import * as Vitest from "vitest";

import * as Maybe from "../index.js";

Vitest.describe("[runtime] Maybe.toResult", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Maybe.toResult).toBeDefined();
  });
});

Vitest.describe("[types] Maybe.toResult", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Maybe.toResult;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
