import * as Vitest from "vitest";

import * as List from "../index.js";

Vitest.describe("[runtime] List.isNotEmpty", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(List.isNotEmpty).toBeDefined();
  });

  Vitest.it("should return true for non-empty arrays", () => {
    Vitest.expect(List.isNotEmpty([1])).toBe(true);
    Vitest.expect(List.isNotEmpty([1, 2, 3])).toBe(true);
    Vitest.expect(List.isNotEmpty(["a"])).toBe(true);
    Vitest.expect(List.isNotEmpty([null])).toBe(true);
    Vitest.expect(List.isNotEmpty([undefined])).toBe(true);
  });

  Vitest.it("should return false for empty arrays", () => {
    Vitest.expect(List.isNotEmpty([])).toBe(false);
  });

  Vitest.it("should work with arrays of different types", () => {
    const mixedArray = [1, "string", {}, [], true];
    Vitest.expect(List.isNotEmpty(mixedArray)).toBe(true);
  });
});

Vitest.describe("[types] List.isNotEmpty", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof List.isNotEmpty;

    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
