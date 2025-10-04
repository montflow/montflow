import * as Vitest from "vitest";

import * as Numeric from "../index.js";

Vitest.describe("[runtime] Numeric.clamp", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Numeric.clamp).toBeDefined();
  });

  Vitest.describe("non-curried usage", () => {
    Vitest.it("should return the original number when within range", () => {
      const result = Numeric.clamp(5, [1, 10]);
      Vitest.expect(result).toBe(5);
    });

    Vitest.it("should clamp to minimum when below range", () => {
      const result = Numeric.clamp(0, [1, 10]);
      Vitest.expect(result).toBe(1);
    });

    Vitest.it("should clamp to maximum when above range", () => {
      const result = Numeric.clamp(15, [1, 10]);
      Vitest.expect(result).toBe(10);
    });

    Vitest.it("should return minimum when at minimum boundary", () => {
      const result = Numeric.clamp(1, [1, 10]);
      Vitest.expect(result).toBe(1);
    });

    Vitest.it("should return maximum when at maximum boundary", () => {
      const result = Numeric.clamp(10, [1, 10]);
      Vitest.expect(result).toBe(10);
    });

    Vitest.it("should work with negative numbers", () => {
      Vitest.expect(Numeric.clamp(-15, [-10, 0])).toBe(-10);
      Vitest.expect(Numeric.clamp(-5, [-10, 0])).toBe(-5);
      Vitest.expect(Numeric.clamp(5, [-10, 0])).toBe(0);
    });

    Vitest.it("should work with decimal numbers", () => {
      Vitest.expect(Numeric.clamp(0.5, [1.1, 3.9])).toBe(1.1);
      Vitest.expect(Numeric.clamp(2.5, [1.1, 3.9])).toBe(2.5);
      Vitest.expect(Numeric.clamp(4.5, [1.1, 3.9])).toBe(3.9);
    });

    Vitest.it("should work with very large numbers", () => {
      const largeRange = [
        -Numeric.Constructor.MAX_VALUE,
        Numeric.Constructor.MAX_VALUE,
      ] as const;
      Vitest.expect(Numeric.clamp(1000, largeRange)).toBe(1000);
      Vitest.expect(Numeric.clamp(Numeric.Constructor.MAX_VALUE, largeRange)).toBe(
        Numeric.Constructor.MAX_VALUE
      );
      Vitest.expect(Numeric.clamp(-Numeric.Constructor.MAX_VALUE, largeRange)).toBe(
        -Numeric.Constructor.MAX_VALUE
      );
    });

    Vitest.it("should work with very small ranges", () => {
      const smallRange = [0.1, 0.2] as const;
      Vitest.expect(Numeric.clamp(0.05, smallRange)).toBe(0.1);
      Vitest.expect(Numeric.clamp(0.15, smallRange)).toBe(0.15);
      Vitest.expect(Numeric.clamp(0.25, smallRange)).toBe(0.2);
    });
  });

  Vitest.describe("curried usage", () => {
    Vitest.it("should return a function when called with range only", () => {
      const clampToRange = Numeric.clamp([1, 10]);
      Vitest.expect(typeof clampToRange).toBe("function");
    });

    Vitest.it("should work with curried function", () => {
      const clampToRange = Numeric.clamp([1, 10]);
      Vitest.expect(clampToRange(5)).toBe(5);
      Vitest.expect(clampToRange(0)).toBe(1);
      Vitest.expect(clampToRange(15)).toBe(10);
      Vitest.expect(clampToRange(1)).toBe(1);
      Vitest.expect(clampToRange(10)).toBe(10);
    });

    Vitest.it("should work with curried function and negative ranges", () => {
      const clampToNegativeRange = Numeric.clamp([-10, -1]);
      Vitest.expect(clampToNegativeRange(-15)).toBe(-10);
      Vitest.expect(clampToNegativeRange(-5)).toBe(-5);
      Vitest.expect(clampToNegativeRange(0)).toBe(-1);
    });

    Vitest.it("should work with curried function and decimal ranges", () => {
      const clampToDecimalRange = Numeric.clamp([1.5, 2.5]);
      Vitest.expect(clampToDecimalRange(1.0)).toBe(1.5);
      Vitest.expect(clampToDecimalRange(2.0)).toBe(2.0);
      Vitest.expect(clampToDecimalRange(3.0)).toBe(2.5);
    });
  });

  Vitest.describe("edge cases", () => {
    Vitest.it("should work with zero-width ranges", () => {
      Vitest.expect(Numeric.clamp(5, [7, 7])).toBe(7);
      Vitest.expect(Numeric.clamp(7, [7, 7])).toBe(7);
      Vitest.expect(Numeric.clamp(3, [7, 7])).toBe(7);
    });

    Vitest.it("should work with ranges containing zero", () => {
      const zeroRange = [-5, 5] as const;
      Vitest.expect(Numeric.clamp(-10, zeroRange)).toBe(-5);
      Vitest.expect(Numeric.clamp(0, zeroRange)).toBe(0);
      Vitest.expect(Numeric.clamp(10, zeroRange)).toBe(5);
    });

    Vitest.it("should work with ranges where min equals zero", () => {
      const minZeroRange = [0, 10] as const;
      Vitest.expect(Numeric.clamp(-5, minZeroRange)).toBe(0);
      Vitest.expect(Numeric.clamp(0, minZeroRange)).toBe(0);
      Vitest.expect(Numeric.clamp(5, minZeroRange)).toBe(5);
      Vitest.expect(Numeric.clamp(15, minZeroRange)).toBe(10);
    });

    Vitest.it("should work with ranges where max equals zero", () => {
      const maxZeroRange = [-10, 0] as const;
      Vitest.expect(Numeric.clamp(-15, maxZeroRange)).toBe(-10);
      Vitest.expect(Numeric.clamp(-5, maxZeroRange)).toBe(-5);
      Vitest.expect(Numeric.clamp(0, maxZeroRange)).toBe(0);
      Vitest.expect(Numeric.clamp(5, maxZeroRange)).toBe(0);
    });

    Vitest.it("should handle very small differences", () => {
      const epsilon = Numeric.Constructor.EPSILON;
      const tinyRange = [1, 1 + epsilon] as const;
      Vitest.expect(Numeric.clamp(0.5, tinyRange)).toBe(1);
      Vitest.expect(Numeric.clamp(1 + epsilon / 2, tinyRange)).toBe(1 + epsilon / 2);
      Vitest.expect(Numeric.clamp(2, tinyRange)).toBe(1 + epsilon);
    });
  });

  Vitest.describe("range validation", () => {
    Vitest.it("should work with object ranges", () => {
      const objectRange = { min: 1, max: 10 };
      Vitest.expect(Numeric.clamp(5, objectRange)).toBe(5);
      Vitest.expect(Numeric.clamp(0, objectRange)).toBe(1);
      Vitest.expect(Numeric.clamp(15, objectRange)).toBe(10);
    });

    Vitest.it("should work with tuple ranges", () => {
      const tupleRange = [1, 10] as const;
      Vitest.expect(Numeric.clamp(5, tupleRange)).toBe(5);
      Vitest.expect(Numeric.clamp(0, tupleRange)).toBe(1);
      Vitest.expect(Numeric.clamp(15, tupleRange)).toBe(10);
    });
  });
});

Vitest.describe("[types] Numeric.clamp", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Numeric.clamp;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it("should accept number and range in non-curried form", () => {
    type Test = typeof Numeric.clamp;
    Vitest.expectTypeOf<Test>().toMatchTypeOf<
      (self: number, range: readonly [number, number]) => number
    >();
  });

  Vitest.it("should accept range in curried form", () => {
    type Test = typeof Numeric.clamp;
    Vitest.expectTypeOf<Test>().toMatchTypeOf<
      (range: readonly [number, number]) => (self: number) => number
    >();
  });

  Vitest.it("should return number for non-curried usage", () => {
    const result = Numeric.clamp(5, [1, 10]);
    Vitest.expectTypeOf(result).toEqualTypeOf<number>();
  });

  Vitest.it("should return function for curried usage", () => {
    const curriedFn = Numeric.clamp([1, 10]);
    Vitest.expectTypeOf(curriedFn).toEqualTypeOf<(self: number) => number>();
  });

  Vitest.it("should accept both tuple and object ranges", () => {
    // Tuple ranges
    Numeric.clamp(5, [1, 10]);
    Numeric.clamp([1, 10]);

    // Object ranges
    Numeric.clamp(5, { min: 1, max: 10 });
    Numeric.clamp({ min: 1, max: 10 });
  });

  Vitest.it("should work with const assertions", () => {
    const range = [1, 10] as const;
    const result = Numeric.clamp(5, range);
    Vitest.expectTypeOf(result).toEqualTypeOf<number>();

    const curriedFn = Numeric.clamp(range);
    Vitest.expectTypeOf(curriedFn).toEqualTypeOf<(self: number) => number>();
  });
});
