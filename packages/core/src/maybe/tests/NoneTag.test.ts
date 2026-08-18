import * as Vitest from "vitest";

import * as Maybe from "../index.js";

Vitest.describe("[runtime] Maybe.NoneTag", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Maybe.NoneTag).toBeDefined();
  });
});

Vitest.describe("[types] Maybe.NoneTag", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Maybe.NoneTag;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
