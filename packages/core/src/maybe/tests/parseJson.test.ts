import * as Vitest from "vitest";

import * as Maybe from "../index.js";

Vitest.describe("[runtime] Maybe.parseJson", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Maybe.parseJson).toBeDefined();
  });
});

Vitest.describe("[types] Maybe.parseJson", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Maybe.parseJson;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
