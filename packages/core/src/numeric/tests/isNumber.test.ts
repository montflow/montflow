import * as Vitest from "vitest";

import * as Numeric from "../index.js";

Vitest.describe("[runtime] Numeric.isNumber", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Numeric.isNumber).toBeDefined();
  });

  Vitest.it("should return true for valid numbers", () => {
    Vitest.expect(Numeric.isNumber(0)).toBe(true);
    Vitest.expect(Numeric.isNumber(42)).toBe(true);
    Vitest.expect(Numeric.isNumber(-1)).toBe(true);
    Vitest.expect(Numeric.isNumber(3.14)).toBe(true);
    Vitest.expect(Numeric.isNumber(Infinity)).toBe(true);
    Vitest.expect(Numeric.isNumber(-Infinity)).toBe(true);
  });

  Vitest.it("should return false for NaN", () => {
    Vitest.expect(Numeric.isNumber(NaN)).toBe(false);
  });

  Vitest.it("should return false for non-numbers", () => {
    Vitest.expect(Numeric.isNumber(null)).toBe(false);
    Vitest.expect(Numeric.isNumber(undefined)).toBe(false);
    Vitest.expect(Numeric.isNumber("42")).toBe(false);
    Vitest.expect(Numeric.isNumber([])).toBe(false);
    Vitest.expect(Numeric.isNumber({})).toBe(false);
    Vitest.expect(Numeric.isNumber(true)).toBe(false);
    Vitest.expect(Numeric.isNumber(BigInt(42))).toBe(false);
    Vitest.expect(Numeric.isNumber(Symbol())).toBe(false);
  });
});

Vitest.describe("[types] Numeric.isNumber", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Numeric.isNumber;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it("should maintain type narrowing", () => {
    const value = 42 as unknown;

    if (Numeric.isNumber(value)) {
      type Test = typeof value;
      type Expect = number;
      Vitest.expectTypeOf<Test>().toMatchTypeOf<Expect>();
    }
  });
});
