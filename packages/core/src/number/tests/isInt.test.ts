import * as Vitest from "vitest";

import * as Number from "../index.js";

Vitest.describe("[runtime] Number.isInt", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Number.isInt).toBeDefined();
  });

  Vitest.it("should return true for integers", () => {
    Vitest.expect(Number.isInt(0)).toBe(true);
    Vitest.expect(Number.isInt(42)).toBe(true);
    Vitest.expect(Number.isInt(-1)).toBe(true);
    Vitest.expect(Number.isInt(Number.Constructor.MAX_SAFE_INTEGER)).toBe(true);
    Vitest.expect(Number.isInt(Number.Constructor.MIN_SAFE_INTEGER)).toBe(true);
  });

  Vitest.it("should return false for non-integer numbers", () => {
    Vitest.expect(Number.isInt(3.14)).toBe(false);
    Vitest.expect(Number.isInt(0.1)).toBe(false);
    Vitest.expect(Number.isInt(-2.5)).toBe(false);
    Vitest.expect(Number.isInt(Infinity)).toBe(false);
    Vitest.expect(Number.isInt(-Infinity)).toBe(false);
    Vitest.expect(Number.isInt(NaN)).toBe(false);
  });

  Vitest.it("should return false for non-numbers", () => {
    Vitest.expect(Number.isInt(null)).toBe(false);
    Vitest.expect(Number.isInt(undefined)).toBe(false);
    Vitest.expect(Number.isInt("42")).toBe(false);
    Vitest.expect(Number.isInt([])).toBe(false);
    Vitest.expect(Number.isInt({})).toBe(false);
    Vitest.expect(Number.isInt(true)).toBe(false);
    Vitest.expect(Number.isInt(BigInt(42))).toBe(false);
  });
});

Vitest.describe("[types] Number.isInt", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Number.isInt;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it("should maintain type narrowing", () => {
    const value = 42 as unknown;

    if (Number.isInt(value)) {
      type Test = typeof value;
      type Expect = number;
      Vitest.expectTypeOf<Test>().toMatchTypeOf<Expect>();
    }
  });
});
