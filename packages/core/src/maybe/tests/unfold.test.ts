import * as Vitest from "vitest";

import * as Maybe from "../index.js";

Vitest.describe("[runtime] Maybe.unfold", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Maybe.unfold).toBeDefined();
  });
});

Vitest.describe("[types] Maybe.unfold", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Maybe.unfold;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});

Vitest.describe("[types] Maybe.Unfold", () => {
  Vitest.it("should be defined", () => {
    type Test = Maybe.Unfold<Maybe.Maybe<Maybe.Maybe<string>>>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
