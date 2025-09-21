import * as Vitest from "vitest";

import * as Object from "../index.js";

Vitest.describe("[types] Object.Optional", () => {
  Vitest.it("should be defined", () => {
    type Test = Object.Optional<{ a: number; b: string }, "b">;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
