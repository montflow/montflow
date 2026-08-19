import * as Vitest from 'vitest';

import * as Numeric from '../index.js';

Vitest.describe('[runtime] Numeric.isInt', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Numeric.isInt).toBeDefined();
  });

  Vitest.it('should return true for integers', () => {
    Vitest.expect(Numeric.isInt(0)).toBe(true);
    Vitest.expect(Numeric.isInt(42)).toBe(true);
    Vitest.expect(Numeric.isInt(-1)).toBe(true);
    Vitest.expect(Numeric.isInt(Numeric.Constructor.MAX_SAFE_INTEGER)).toBe(true);
    Vitest.expect(Numeric.isInt(Numeric.Constructor.MIN_SAFE_INTEGER)).toBe(true);
  });

  Vitest.it('should return false for non-integer numbers', () => {
    Vitest.expect(Numeric.isInt(3.14)).toBe(false);
    Vitest.expect(Numeric.isInt(0.1)).toBe(false);
    Vitest.expect(Numeric.isInt(-2.5)).toBe(false);
    Vitest.expect(Numeric.isInt(Infinity)).toBe(false);
    Vitest.expect(Numeric.isInt(-Infinity)).toBe(false);
    Vitest.expect(Numeric.isInt(NaN)).toBe(false);
  });

  Vitest.it('should return false for non-numbers', () => {
    Vitest.expect(Numeric.isInt(null)).toBe(false);
    Vitest.expect(Numeric.isInt(undefined)).toBe(false);
    Vitest.expect(Numeric.isInt('42')).toBe(false);
    Vitest.expect(Numeric.isInt([])).toBe(false);
    Vitest.expect(Numeric.isInt({})).toBe(false);
    Vitest.expect(Numeric.isInt(true)).toBe(false);
    Vitest.expect(Numeric.isInt(BigInt(42))).toBe(false);
  });
});

Vitest.describe('[types] Numeric.isInt', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Numeric.isInt;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should maintain type narrowing', () => {
    // SAFETY: deliberate widening of a known number to unknown to exercise
    // the type guard's narrowing.
    const value = 42 as unknown;

    if (Numeric.isInt(value)) {
      type Test = typeof value;
      type Expect = number;
      Vitest.expectTypeOf<Test>().toMatchTypeOf<Expect>();
    }
  });
});
