import * as Vitest from "vitest";

import * as Number from "../index.js";

Vitest.describe("[runtime] Number.isRange", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Number.isRange).toBeDefined();
  });

  Vitest.it("should return true for valid tuple range", () => {
    const range: Number.Range = [10, 15];
    const result = Number.isRange(range);

    Vitest.expect(result).toBe(true);
  });
  Vitest.it("should return false for invalid tuple range", () => {
    const range: Number.Range = [10, -15];
    const result = Number.isRange(range);

    Vitest.expect(result).toBe(false);
  });

  Vitest.it("should return true for valid object range", () => {
    const range: Number.Range = { min: 4, max: 42 };
    const result = Number.isRange(range);

    Vitest.expect(result).toBe(true);
  });

  Vitest.it("should return false for invalid object range", () => {
    const range: Number.Range = { min: 4, max: 2 };
    const result = Number.isRange(range);

    Vitest.expect(result).toBe(false);
  });

  Vitest.it("should return true for range with same min and max", () => {
    const range: Number.Range = { min: 2, max: 2 };
    const result = Number.isRange(range);

    Vitest.expect(result).toBe(true);
  });

  Vitest.it("should return false for non-range values", () => {
    Vitest.expect(Number.isRange(null)).toBe(false);
    Vitest.expect(Number.isRange(undefined)).toBe(false);
    Vitest.expect(Number.isRange(42)).toBe(false);
    Vitest.expect(Number.isRange("string")).toBe(false);
    Vitest.expect(Number.isRange({})).toBe(false);
    Vitest.expect(Number.isRange([])).toBe(false);
    Vitest.expect(Number.isRange([1])).toBe(false);
    Vitest.expect(Number.isRange([1, 2, 3])).toBe(false);
    Vitest.expect(Number.isRange({ min: "1", max: 2 })).toBe(false);
    Vitest.expect(Number.isRange({ min: 1, max: "2" })).toBe(false);
    Vitest.expect(Number.isRange({ min: 1 })).toBe(false);
    Vitest.expect(Number.isRange({ max: 2 })).toBe(false);
    Vitest.expect(Number.isRange({ min: 1, max: 2, extra: 3 })).toBe(false);
  });
});

Vitest.describe("[types] Number.isRange", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Number.isRange;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it("should maintain type narrowing for tuple ranges", () => {
    const range = [1, 10] as unknown;

    if (Number.isRange(range)) {
      type Test = typeof range;
      type Expect = Number.Range;
      Vitest.expectTypeOf<Test>().toMatchTypeOf<Expect>();
    }
  });

  Vitest.it("should maintain type narrowing for object ranges", () => {
    const range = { min: 0, max: 100 } as unknown;

    if (Number.isRange(range)) {
      type Test = typeof range;
      type Expect = Number.Range;
      Vitest.expectTypeOf<Test>().toMatchTypeOf<Expect>();
    }
  });
});
