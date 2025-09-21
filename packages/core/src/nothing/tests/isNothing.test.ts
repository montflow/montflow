import * as Vitest from "vitest";

import * as Nothing from "../index.js";

Vitest.describe("[runtime] Nothing.isNothing", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Nothing.isNothing).toBeDefined();
  });

  Vitest.it("should return true for Nothing instance", () => {
    const nothing = Nothing.make();
    const value = Nothing.isNothing(nothing);

    Vitest.expect(value).toBe(true);
  });

  Vitest.it("should return false for null", () => {
    const nothing = null;
    const value = Nothing.isNothing(nothing);

    Vitest.expect(value).toBe(false);
  });

  Vitest.it("should return false for undefined", () => {
    const nothing = undefined;
    const value = Nothing.isNothing(nothing);

    Vitest.expect(value).toBe(false);
  });

  Vitest.it("should return false for empty object", () => {
    const nothing = {};
    const value = Nothing.isNothing(nothing);

    Vitest.expect(value).toBe(false);
  });
});

Vitest.describe("[types] Nothing.isNothing", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Nothing.isNothing;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
