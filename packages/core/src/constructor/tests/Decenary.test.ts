import * as Vitest from "vitest";

import * as Constructor from "../index.js";

Vitest.describe("[types] Constructor.Decenary", () => {
  Vitest.it("should be defined", () => {
    type Test = Constructor.Decenary<
      string,
      number,
      boolean,
      object,
      any,
      unknown,
      null,
      undefined,
      void,
      never,
      symbol
    >;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
