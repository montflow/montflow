import * as Vitest from "vitest";

import * as Array from "../index.js";

Vitest.describe("[runtime] Array.isNotEmpty", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Array.isNotEmpty).toBeDefined();
  });

  Vitest.it("should return true for non-empty arrays", () => {
    Vitest.expect(Array.isNotEmpty([1])).toBe(true);
    Vitest.expect(Array.isNotEmpty([1, 2, 3])).toBe(true);
    Vitest.expect(Array.isNotEmpty(["a"])).toBe(true);
    Vitest.expect(Array.isNotEmpty([null])).toBe(true);
    Vitest.expect(Array.isNotEmpty([undefined])).toBe(true);
  });

  Vitest.it("should return false for empty arrays", () => {
    Vitest.expect(Array.isNotEmpty([])).toBe(false);
  });

  Vitest.it("should work with arrays of different types", () => {
    const mixedArray = [1, "string", {}, [], true];
    Vitest.expect(Array.isNotEmpty(mixedArray)).toBe(true);
  });
});

Vitest.describe("[types] Array.isNotEmpty", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Array.isNotEmpty;

    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
