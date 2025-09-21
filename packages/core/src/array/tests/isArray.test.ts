import * as Vitest from "vitest";

import * as Array from "../index.js";

Vitest.describe.concurrent("[runtime] Array.isArray", () => {
  Vitest.it.concurrent("should be defined", () => {
    Vitest.expect(Array.isArray).toBeDefined();
  });

  Vitest.it.concurrent("should return true for arrays", () => {
    Vitest.expect(Array.isArray([])).toBe(true);
    Vitest.expect(Array.isArray([1, 2, 3])).toBe(true);
    Vitest.expect(Array.isArray(["a", "b", "c"])).toBe(true);
  });

  Vitest.it.concurrent("should return false for non-array values", () => {
    Vitest.expect(Array.isArray(null)).toBe(false);
    Vitest.expect(Array.isArray(undefined)).toBe(false);
    Vitest.expect(Array.isArray({})).toBe(false);
    Vitest.expect(Array.isArray(42)).toBe(false);
    Vitest.expect(Array.isArray("string")).toBe(false);
  });
});

Vitest.describe("[types] Array.isArray", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Array.isArray;

    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it("should infer array item type if checking array", () => {
    const array = [1, 2, 3];

    if (Array.isArray(array)) {
      type Test = typeof array;
      type Expected = Array<number>;
      Vitest.expectTypeOf<Test>().toEqualTypeOf<Expected>();
    }
  });

  Vitest.it("should infer array item type as unknown if thing is unknown", () => {
    const array: unknown = null;

    if (Array.isArray(array)) {
      type Test = typeof array;
      type Expected = Array<unknown>;
      Vitest.expectTypeOf<Test>().toEqualTypeOf<Expected>();
    }
  });
});
