import * as Vitest from 'vitest';

import * as Numeric from '../index.js';

Vitest.describe('[runtime] Numeric.isDivisor', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Numeric.isDivisor).toBeDefined();
  });

  Vitest.describe('non-curried usage', () => {
    Vitest.it('should return true when self divides evenly into by', () => {
      Vitest.expect(Numeric.isDivisor(3, 9)).toBe(true);
      Vitest.expect(Numeric.isDivisor(2, 8)).toBe(true);
      Vitest.expect(Numeric.isDivisor(5, 25)).toBe(true);
      Vitest.expect(Numeric.isDivisor(7, 49)).toBe(true);
    });

    Vitest.it('should return false when self does not divide evenly into by', () => {
      Vitest.expect(Numeric.isDivisor(4, 9)).toBe(false);
      Vitest.expect(Numeric.isDivisor(3, 10)).toBe(false);
      Vitest.expect(Numeric.isDivisor(6, 25)).toBe(false);
      Vitest.expect(Numeric.isDivisor(8, 49)).toBe(false);
    });

    Vitest.it('should return true when self equals by', () => {
      Vitest.expect(Numeric.isDivisor(5, 5)).toBe(true);
      Vitest.expect(Numeric.isDivisor(10, 10)).toBe(true);
      Vitest.expect(Numeric.isDivisor(1, 1)).toBe(true);
    });

    Vitest.it('should return true when by is zero and self is non-zero', () => {
      Vitest.expect(Numeric.isDivisor(5, 0)).toBe(true);
      Vitest.expect(Numeric.isDivisor(10, 0)).toBe(true);
      Vitest.expect(Numeric.isDivisor(-3, 0)).toBe(true);
    });

    Vitest.it('should work with negative numbers', () => {
      Vitest.expect(Numeric.isDivisor(-3, 9)).toBe(true);
      Vitest.expect(Numeric.isDivisor(3, -9)).toBe(true);
      Vitest.expect(Numeric.isDivisor(-3, -9)).toBe(true);
      Vitest.expect(Numeric.isDivisor(-4, 9)).toBe(false);
    });

    Vitest.it('should work with decimal numbers', () => {
      Vitest.expect(Numeric.isDivisor(2.5, 10)).toBe(true);
      Vitest.expect(Numeric.isDivisor(0.5, 2.5)).toBe(true);
      Vitest.expect(Numeric.isDivisor(1.5, 4.5)).toBe(true);
      Vitest.expect(Numeric.isDivisor(2.5, 9)).toBe(false);
    });

    Vitest.it('should return false when self is zero and by is non-zero', () => {
      Vitest.expect(Numeric.isDivisor(0, 5)).toBe(false);
      Vitest.expect(Numeric.isDivisor(0, 10)).toBe(false);
      Vitest.expect(Numeric.isDivisor(0, -3)).toBe(false);
    });
  });

  Vitest.describe('curried usage', () => {
    Vitest.it('should return a function when called with by only', () => {
      const isDivisorOf12 = Numeric.isDivisor(12);
      Vitest.expect(typeof isDivisorOf12).toBe('function');
    });

    Vitest.it('should work with curried function', () => {
      const isDivisorOf12 = Numeric.isDivisor(12);
      Vitest.expect(isDivisorOf12(3)).toBe(true);
      Vitest.expect(isDivisorOf12(4)).toBe(true);
      Vitest.expect(isDivisorOf12(6)).toBe(true);
      Vitest.expect(isDivisorOf12(12)).toBe(true);
      Vitest.expect(isDivisorOf12(5)).toBe(false);
      Vitest.expect(isDivisorOf12(7)).toBe(false);
    });

    Vitest.it('should work with curried function and negative numbers', () => {
      const isDivisorOfNegative = Numeric.isDivisor(-12);
      Vitest.expect(isDivisorOfNegative(3)).toBe(true);
      Vitest.expect(isDivisorOfNegative(-4)).toBe(true);
      Vitest.expect(isDivisorOfNegative(5)).toBe(false);
    });

    Vitest.it('should work with curried function and zero', () => {
      const isDivisorOfZero = Numeric.isDivisor(0);
      Vitest.expect(isDivisorOfZero(5)).toBe(true);
      Vitest.expect(isDivisorOfZero(10)).toBe(true);
      Vitest.expect(isDivisorOfZero(0)).toBe(false);
    });

    Vitest.it('should work with curried function and decimal numbers', () => {
      const isDivisorOf10 = Numeric.isDivisor(10);
      Vitest.expect(isDivisorOf10(2.5)).toBe(true);
      Vitest.expect(isDivisorOf10(0.5)).toBe(true);
      Vitest.expect(isDivisorOf10(3)).toBe(false);
    });
  });

  Vitest.describe('edge cases', () => {
    Vitest.it('should handle very large numbers', () => {
      const largeNumber = 1000000;
      Vitest.expect(Numeric.isDivisor(1000, largeNumber)).toBe(true);
      Vitest.expect(Numeric.isDivisor(1000000, largeNumber)).toBe(true);
      Vitest.expect(Numeric.isDivisor(999, largeNumber)).toBe(false);
    });

    Vitest.it('should handle very small numbers', () => {
      const smallNumber = 0.01;
      Vitest.expect(Numeric.isDivisor(0.001, smallNumber)).toBe(true);
      Vitest.expect(Numeric.isDivisor(0.005, smallNumber)).toBe(true);
      Vitest.expect(Numeric.isDivisor(0.003, smallNumber)).toBe(false);
    });

    Vitest.it('should handle one as divisor', () => {
      Vitest.expect(Numeric.isDivisor(1, 5)).toBe(true);
      Vitest.expect(Numeric.isDivisor(1, 100)).toBe(true);
      Vitest.expect(Numeric.isDivisor(1, -7)).toBe(true);
      Vitest.expect(Numeric.isDivisor(1, 0)).toBe(true);
    });

    Vitest.it('should handle self greater than by', () => {
      Vitest.expect(Numeric.isDivisor(10, 5)).toBe(false);
      Vitest.expect(Numeric.isDivisor(20, 10)).toBe(false);
      Vitest.expect(Numeric.isDivisor(100, 50)).toBe(false);
    });
  });
});

Vitest.describe('[types] Numeric.isDivisor', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Numeric.isDivisor;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should accept number and number in non-curried form', () => {
    type Test = typeof Numeric.isDivisor;
    Vitest.expectTypeOf<Test>().toMatchTypeOf<(self: number, by: number) => boolean>();
  });

  Vitest.it('should accept number in curried form', () => {
    type Test = typeof Numeric.isDivisor;
    Vitest.expectTypeOf<Test>().toMatchTypeOf<(by: number) => (self: number) => boolean>();
  });

  Vitest.it('should return boolean for non-curried usage', () => {
    const result = Numeric.isDivisor(3, 9);
    Vitest.expectTypeOf(result).toEqualTypeOf<boolean>();
  });

  Vitest.it('should return function for curried usage', () => {
    const curriedFn = Numeric.isDivisor(12);
    Vitest.expectTypeOf(curriedFn).toEqualTypeOf<(self: number) => boolean>();
  });

  Vitest.it('should work with const assertions', () => {
    const by = 12 as const;
    const result = Numeric.isDivisor(3, by);
    Vitest.expectTypeOf(result).toEqualTypeOf<boolean>();

    const curriedFn = Numeric.isDivisor(by);
    Vitest.expectTypeOf(curriedFn).toEqualTypeOf<(self: number) => boolean>();
  });
});
