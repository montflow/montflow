import * as Vitest from "vitest";

import * as Maybe from "../index.js";

Vitest.describe("[runtime] Maybe.flatten", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Maybe.flatten).toBeDefined();
  });
});

Vitest.describe("[types] Maybe.flatten", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Maybe.flatten;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});

Vitest.describe("[types] Maybe.Flatten", () => {
  Vitest.it("should be defined", () => {
    type Test = Maybe.Flatten<Maybe.Maybe<Maybe.Maybe<string>>>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
