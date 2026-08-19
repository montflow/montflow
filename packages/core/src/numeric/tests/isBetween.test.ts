import * as Vitest from 'vitest';

import * as Numeric from '../index.js';

Vitest.describe('[runtime] Numeric.isBetween', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Numeric.isBetween).toBeDefined();
  });

  Vitest.describe('non-curried usage', () => {
    Vitest.it('should return true for number within range (default inclusive)', () => {
      const result = Numeric.isBetween(5, [1, 10]);
      Vitest.expect(result).toBe(true);
    });

    Vitest.it('should return true for number at minimum boundary (default inclusive)', () => {
      const result = Numeric.isBetween(1, [1, 10]);
      Vitest.expect(result).toBe(true);
    });

    Vitest.it('should return true for number at maximum boundary (default inclusive)', () => {
      const result = Numeric.isBetween(10, [1, 10]);
      Vitest.expect(result).toBe(true);
    });

    Vitest.it('should return false for number below range', () => {
      const result = Numeric.isBetween(0, [1, 10]);
      Vitest.expect(result).toBe(false);
    });

    Vitest.it('should return false for number above range', () => {
      const result = Numeric.isBetween(11, [1, 10]);
      Vitest.expect(result).toBe(false);
    });

    Vitest.describe('with inclusive: true', () => {
      Vitest.it('should include both boundaries', () => {
        Vitest.expect(Numeric.isBetween(1, [1, 10], { inclusive: true })).toBe(true);
        Vitest.expect(Numeric.isBetween(10, [1, 10], { inclusive: true })).toBe(true);
        Vitest.expect(Numeric.isBetween(5, [1, 10], { inclusive: true })).toBe(true);
      });
    });

    Vitest.describe('with inclusive: false', () => {
      Vitest.it('should exclude both boundaries', () => {
        Vitest.expect(Numeric.isBetween(1, [1, 10], { inclusive: false })).toBe(false);
        Vitest.expect(Numeric.isBetween(10, [1, 10], { inclusive: false })).toBe(false);
        Vitest.expect(Numeric.isBetween(5, [1, 10], { inclusive: false })).toBe(true);
      });
    });

    Vitest.describe('with object-based inclusive options', () => {
      Vitest.it('should respect min: false, max: true', () => {
        const options = { inclusive: { min: false, max: true } };
        Vitest.expect(Numeric.isBetween(1, [1, 10], options)).toBe(false);
        Vitest.expect(Numeric.isBetween(10, [1, 10], options)).toBe(true);
        Vitest.expect(Numeric.isBetween(5, [1, 10], options)).toBe(true);
      });

      Vitest.it('should respect min: true, max: false', () => {
        const options = { inclusive: { min: true, max: false } };
        Vitest.expect(Numeric.isBetween(1, [1, 10], options)).toBe(true);
        Vitest.expect(Numeric.isBetween(10, [1, 10], options)).toBe(false);
        Vitest.expect(Numeric.isBetween(5, [1, 10], options)).toBe(true);
      });

      Vitest.it('should respect min: false, max: false', () => {
        const options = { inclusive: { min: false, max: false } };
        Vitest.expect(Numeric.isBetween(1, [1, 10], options)).toBe(false);
        Vitest.expect(Numeric.isBetween(10, [1, 10], options)).toBe(false);
        Vitest.expect(Numeric.isBetween(5, [1, 10], options)).toBe(true);
      });

      Vitest.it('should default to true for unspecified boundaries', () => {
        Vitest.expect(Numeric.isBetween(1, [1, 10], { inclusive: {} })).toBe(true);
        Vitest.expect(Numeric.isBetween(10, [1, 10], { inclusive: {} })).toBe(true);
        Vitest.expect(Numeric.isBetween(1, [1, 10], { inclusive: { max: false } })).toBe(true);
        Vitest.expect(Numeric.isBetween(10, [1, 10], { inclusive: { min: false } })).toBe(true);
      });
    });

    Vitest.it('should work with negative numbers', () => {
      Vitest.expect(Numeric.isBetween(-5, [-10, 0])).toBe(true);
      Vitest.expect(Numeric.isBetween(-10, [-10, 0])).toBe(true);
      Vitest.expect(Numeric.isBetween(0, [-10, 0])).toBe(true);
      Vitest.expect(Numeric.isBetween(-15, [-10, 0])).toBe(false);
    });

    Vitest.it('should work with decimal numbers', () => {
      Vitest.expect(Numeric.isBetween(2.5, [1.1, 3.9])).toBe(true);
      Vitest.expect(Numeric.isBetween(1.1, [1.1, 3.9])).toBe(true);
      Vitest.expect(Numeric.isBetween(3.9, [1.1, 3.9])).toBe(true);
      Vitest.expect(Numeric.isBetween(1.0, [1.1, 3.9])).toBe(false);
    });
  });

  Vitest.describe('curried usage', () => {
    Vitest.it('should return a function when called with range only', () => {
      const isInRange = Numeric.isBetween([1, 10]);
      Vitest.expect(typeof isInRange).toBe('function');
    });

    Vitest.it('should work with curried function (default inclusive)', () => {
      const isInRange = Numeric.isBetween([1, 10]);
      Vitest.expect(isInRange(5)).toBe(true);
      Vitest.expect(isInRange(1)).toBe(true);
      Vitest.expect(isInRange(10)).toBe(true);
      Vitest.expect(isInRange(0)).toBe(false);
      Vitest.expect(isInRange(11)).toBe(false);
    });

    Vitest.it('should work with curried function and inclusive: false', () => {
      const isInRangeExclusive = Numeric.isBetween([1, 10], {
        inclusive: false,
      });
      Vitest.expect(isInRangeExclusive(5)).toBe(true);
      Vitest.expect(isInRangeExclusive(1)).toBe(false);
      Vitest.expect(isInRangeExclusive(10)).toBe(false);
    });

    Vitest.it('should work with curried function and object-based inclusive options', () => {
      const isInRangeMinExclusive = Numeric.isBetween([1, 10], {
        inclusive: { min: false, max: true },
      });
      Vitest.expect(isInRangeMinExclusive(1)).toBe(false);
      Vitest.expect(isInRangeMinExclusive(10)).toBe(true);
      Vitest.expect(isInRangeMinExclusive(5)).toBe(true);

      const isInRangeMaxExclusive = Numeric.isBetween([1, 10], {
        inclusive: { min: true, max: false },
      });
      Vitest.expect(isInRangeMaxExclusive(1)).toBe(true);
      Vitest.expect(isInRangeMaxExclusive(10)).toBe(false);
      Vitest.expect(isInRangeMaxExclusive(5)).toBe(true);
    });
  });

  Vitest.describe('edge cases', () => {
    Vitest.it('should work with zero-width ranges', () => {
      Vitest.expect(Numeric.isBetween(5, [5, 5])).toBe(true);
      Vitest.expect(Numeric.isBetween(5, [5, 5], { inclusive: false })).toBe(false);
      Vitest.expect(Numeric.isBetween(4, [5, 5])).toBe(false);
    });

    Vitest.it('should work with very small ranges', () => {
      const range = [0.1, 0.2] as const;
      Vitest.expect(Numeric.isBetween(0.15, range)).toBe(true);
      Vitest.expect(Numeric.isBetween(0.1, range)).toBe(true);
      Vitest.expect(Numeric.isBetween(0.2, range)).toBe(true);
      Vitest.expect(Numeric.isBetween(0.05, range)).toBe(false);
    });

    Vitest.it('should handle very large ranges', () => {
      const largeRange = [-Numeric.Constructor.MAX_VALUE, Numeric.Constructor.MAX_VALUE] as const;
      Vitest.expect(Numeric.isBetween(1000, largeRange)).toBe(true);
      Vitest.expect(Numeric.isBetween(Numeric.Constructor.MAX_VALUE, largeRange)).toBe(true);
      Vitest.expect(Numeric.isBetween(-Numeric.Constructor.MAX_VALUE, largeRange)).toBe(true);
    });
  });
});

Vitest.describe('[types] Numeric.isBetween', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Numeric.isBetween;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should accept number, range, and options in non-curried form', () => {
    type Test = typeof Numeric.isBetween;
    Vitest.expectTypeOf<Test>().toMatchTypeOf<
      (
        self: number,
        range: readonly [number, number],
        options?: { inclusive?: boolean | { min?: boolean; max?: boolean } },
      ) => boolean
    >();
  });

  Vitest.it('should accept range and options in curried form', () => {
    type Test = typeof Numeric.isBetween;
    Vitest.expectTypeOf<Test>().toMatchTypeOf<
      (
        range: readonly [number, number],
        options?: { inclusive?: boolean | { min?: boolean; max?: boolean } },
      ) => (self: number) => boolean
    >();
  });

  Vitest.it('should return boolean for non-curried usage', () => {
    const result = Numeric.isBetween(5, [1, 10]);
    Vitest.expectTypeOf(result).toEqualTypeOf<boolean>();
  });

  Vitest.it('should return function for curried usage', () => {
    const curriedFn = Numeric.isBetween([1, 10]);
    Vitest.expectTypeOf(curriedFn).toEqualTypeOf<(self: number) => boolean>();
  });

  Vitest.it('should accept all inclusive option types', () => {
    // Boolean options
    Numeric.isBetween(5, [1, 10], { inclusive: true });
    Numeric.isBetween(5, [1, 10], { inclusive: false });

    // Object options
    Numeric.isBetween(5, [1, 10], { inclusive: { min: true, max: false } });
    Numeric.isBetween(5, [1, 10], { inclusive: { min: false } });
    Numeric.isBetween(5, [1, 10], { inclusive: { max: true } });
    Numeric.isBetween(5, [1, 10], { inclusive: {} });

    // No options
    Numeric.isBetween(5, [1, 10]);
    Numeric.isBetween(5, [1, 10], {});
  });
});
