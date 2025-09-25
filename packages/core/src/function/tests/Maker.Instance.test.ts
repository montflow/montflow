import * as Vitest from "vitest";

import * as Function from "../index.js";

type Example = Function.Maker<{ x: number }, [string, number]>;

Vitest.describe("[types] Function.Maker.Instance", () => {
  Vitest.it("should be defined", () => {
    type Test = Function.Maker.Instance<Example>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
