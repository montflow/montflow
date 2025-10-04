import * as Vitest from "vitest";

import * as List from "../index.js";

Vitest.describe.concurrent("[runtime] List.length", () => {
  Vitest.it.concurrent("should be defined", () => {
    Vitest.expect(List.length).toBeDefined();
  });

  Vitest.it.concurrent("should return 0 for empty arrays", () => {
    Vitest.expect(List.length([])).toBe(0);
  });

  Vitest.it.concurrent("should return correct length for non-empty arrays", () => {
    Vitest.expect(List.length([1])).toBe(1);
    Vitest.expect(List.length([1, 2, 3])).toBe(3);
    Vitest.expect(List.length(["a", "b", "c", "d", "e"])).toBe(5);
  });

  Vitest.it.concurrent("should work with arrays of different types", () => {
    const mixedArray = [1, "string", {}, [], true, null, undefined];
    Vitest.expect(List.length(mixedArray)).toBe(7);
  });

  Vitest.it.concurrent("should work with sparse arrays", () => {
    const sparseArray = new globalThis.Array(5);
    Vitest.expect(List.length(sparseArray)).toBe(5);
  });

  Vitest.it.concurrent("should work with arrays containing undefined values", () => {
    const arrayWithUndefined = [undefined, undefined, undefined];
    Vitest.expect(List.length(arrayWithUndefined)).toBe(3);
  });
});

Vitest.describe("[types] List.length", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof List.length;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it("should accept unknown[] and return number", () => {
    type Test = typeof List.length;
    Vitest.expectTypeOf<Test>().toEqualTypeOf<(array: unknown[]) => number>();
  });
});
