import * as Vitest from "vitest";

import * as Nothing from "../index.js";

Vitest.describe("[runtime] Nothing.make", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Nothing.make).toBeDefined();
  });

  Vitest.it('should have property `_id` = "nothing"', () => {
    const value = Nothing.make();

    Vitest.expect(value._id).toBe("nothing");
  });
});

Vitest.describe("[types] Nothing.make", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Nothing.make;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
