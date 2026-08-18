import * as Vitest from "vitest";

import * as Maybe from "../index.js";

Vitest.describe("[runtime] Maybe.isMaybe", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Maybe.isMaybe).toBeDefined();
  });
});

Vitest.describe("[types] Maybe.isMaybe", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Maybe.isMaybe;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
