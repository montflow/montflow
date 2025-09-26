import * as Vitest from "vitest";

import * as Object from "../index.js";

Vitest.describe("[types] Object.Entries", () => {
  Vitest.it("should be defined", () => {
    type Test = Object.Entries<{ a: string; b: number }>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
