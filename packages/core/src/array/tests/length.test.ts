import * as Vitest from "vitest";

import * as Array from "../index.js";

Vitest.describe.concurrent("[runtime] Array.length", () => {
  Vitest.it.concurrent("should be defined", () => {
    Vitest.expect(Array.length).toBeDefined();
  });

  Vitest.it.concurrent("should return 0 for empty arrays", () => {
    Vitest.expect(Array.length([])).toBe(0);
  });

  Vitest.it.concurrent("should return correct length for non-empty arrays", () => {
    Vitest.expect(Array.length([1])).toBe(1);
    Vitest.expect(Array.length([1, 2, 3])).toBe(3);
    Vitest.expect(Array.length(["a", "b", "c", "d", "e"])).toBe(5);
  });

  Vitest.it.concurrent("should work with arrays of different types", () => {
    const mixedArray = [1, "string", {}, [], true, null, undefined];
    Vitest.expect(Array.length(mixedArray)).toBe(7);
  });

  Vitest.it.concurrent("should work with sparse arrays", () => {
    const sparseArray = new globalThis.Array(5);
    Vitest.expect(Array.length(sparseArray)).toBe(5);
  });

  Vitest.it.concurrent("should work with arrays containing undefined values", () => {
    const arrayWithUndefined = [undefined, undefined, undefined];
    Vitest.expect(Array.length(arrayWithUndefined)).toBe(3);
  });
});

Vitest.describe("[types] Array.length", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Array.length;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it("should accept unknown[] and return number", () => {
    type Test = typeof Array.length;
    Vitest.expectTypeOf<Test>().toEqualTypeOf<(array: unknown[]) => number>();
  });
});
