import * as Vitest from "vitest";

import * as Constructor from "../index.js";

Vitest.describe("[types] Constructor.Nonary", () => {
  Vitest.it("should be defined", () => {
    type Test = Constructor.Nonary<
      string,
      number,
      boolean,
      object,
      any,
      unknown,
      null,
      undefined,
      void,
      never
    >;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
