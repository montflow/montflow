import * as Vitest from "vitest";

import * as Maybe from "../index.js";

Vitest.describe("[runtime] Maybe.unwrap", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Maybe.unwrap).toBeDefined();
  });
});

Vitest.describe("[types] Maybe.unwrap", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Maybe.unwrap;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});

Vitest.describe("[types] Maybe.Value", () => {
  Vitest.it("should be defined", () => {
    type Test = Maybe.Value<Maybe.Maybe<number>>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
