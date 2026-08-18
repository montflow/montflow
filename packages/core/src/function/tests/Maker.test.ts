import * as Vitest from "vitest";

import * as Function from "../index.js";

Vitest.describe("[types] Function.Maker", () => {
  Vitest.it("should be defined", () => {
    type Test = Function.Maker<{ x: number }, [string, number]>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
