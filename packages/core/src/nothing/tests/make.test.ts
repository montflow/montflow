import * as Vitest from "vitest";

import * as Domain from "../../domain/index.js";
import * as Nothing from "../index.js";

Vitest.describe("[runtime] Nothing.make", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Nothing.make).toBeDefined();
  });

  Vitest.it('should have domain identifier "nothing"', () => {
    const value = Nothing.make();

    Vitest.expect(value[Domain.Id]).toBe(Nothing.Id);
  });
});

Vitest.describe("[types] Nothing.make", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Nothing.make;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
