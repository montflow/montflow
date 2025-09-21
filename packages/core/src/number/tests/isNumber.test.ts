import * as Vitest from "vitest";

import * as Number from "../index.js";

Vitest.describe("[runtime] Number.isNumber", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Number.isNumber).toBeDefined();
  });

  Vitest.it("should return true for valid numbers", () => {
    Vitest.expect(Number.isNumber(0)).toBe(true);
    Vitest.expect(Number.isNumber(42)).toBe(true);
    Vitest.expect(Number.isNumber(-1)).toBe(true);
    Vitest.expect(Number.isNumber(3.14)).toBe(true);
    Vitest.expect(Number.isNumber(Infinity)).toBe(true);
    Vitest.expect(Number.isNumber(-Infinity)).toBe(true);
  });

  Vitest.it("should return false for NaN", () => {
    Vitest.expect(Number.isNumber(NaN)).toBe(false);
  });

  Vitest.it("should return false for non-numbers", () => {
    Vitest.expect(Number.isNumber(null)).toBe(false);
    Vitest.expect(Number.isNumber(undefined)).toBe(false);
    Vitest.expect(Number.isNumber("42")).toBe(false);
    Vitest.expect(Number.isNumber([])).toBe(false);
    Vitest.expect(Number.isNumber({})).toBe(false);
    Vitest.expect(Number.isNumber(true)).toBe(false);
    Vitest.expect(Number.isNumber(BigInt(42))).toBe(false);
    Vitest.expect(Number.isNumber(Symbol())).toBe(false);
  });
});

Vitest.describe("[types] Number.isNumber", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Number.isNumber;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it("should maintain type narrowing", () => {
    const value = 42 as unknown;

    if (Number.isNumber(value)) {
      type Test = typeof value;
      type Expect = number;
      Vitest.expectTypeOf<Test>().toMatchTypeOf<Expect>();
    }
  });
});
