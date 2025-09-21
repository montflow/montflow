import * as Vitest from "vitest";

import * as Array from "../index.js";

Vitest.describe("[runtime] Array.isEmpty", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Array.isEmpty).toBeDefined();
  });

  Vitest.it("should return true for empty arrays", () => {
    Vitest.expect(Array.isEmpty([])).toBe(true);
  });

  Vitest.it("should return false for non-empty arrays", () => {
    Vitest.expect(Array.isEmpty([1])).toBe(false);
    Vitest.expect(Array.isEmpty([1, 2, 3])).toBe(false);
    Vitest.expect(Array.isEmpty(["a"])).toBe(false);
    Vitest.expect(Array.isEmpty([null])).toBe(false);
    Vitest.expect(Array.isEmpty([undefined])).toBe(false);
  });

  Vitest.it("should work with arrays of different types", () => {
    const mixedArray = [1, "string", {}, [], true];
    Vitest.expect(Array.isEmpty(mixedArray)).toBe(false);
    Vitest.expect(Array.isEmpty([])).toBe(true);
  });
});

Vitest.describe("[types] Array.isEmpty", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Array.isEmpty;

    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it("should maintain type narrowing", () => {
    const array: number[] = [];

    if (Array.isEmpty(array)) {
      type Test = typeof array.length;
      type Expect = 0;
      Vitest.expectTypeOf<Test>().toEqualTypeOf<Expect>();
    }

    if (Array.isEmpty(array)) {
      type Test = typeof array;
      type Expect = [];
      Vitest.expectTypeOf<Test>().toEqualTypeOf<Expect>();
    }
  });
});
