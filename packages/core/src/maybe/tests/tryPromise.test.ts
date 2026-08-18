import * as Vitest from "vitest";

import * as Maybe from "../index.js";

Vitest.describe("[runtime] Maybe.tryPromise", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Maybe.tryPromise).toBeDefined();
  });
});

Vitest.describe("[types] Maybe.tryPromise", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Maybe.tryPromise;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
