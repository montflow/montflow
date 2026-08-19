import * as Vitest from 'vitest';

import * as Numeric from '../index.js';

Vitest.describe('[runtime] Numeric.isMultiple', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Numeric.isMultiple).toBeDefined();
  });

  Vitest.describe('non-curried usage', () => {
    Vitest.it('should return true when self is a multiple of of', () => {
      Vitest.expect(Numeric.isMultiple(9, 3)).toBe(true);
      Vitest.expect(Numeric.isMultiple(8, 2)).toBe(true);
      Vitest.expect(Numeric.isMultiple(25, 5)).toBe(true);
      Vitest.expect(Numeric.isMultiple(49, 7)).toBe(true);
    });

    Vitest.it('should return false when self is not a multiple of of', () => {
      Vitest.expect(Numeric.isMultiple(9, 4)).toBe(false);
      Vitest.expect(Numeric.isMultiple(10, 3)).toBe(false);
      Vitest.expect(Numeric.isMultiple(25, 6)).toBe(false);
      Vitest.expect(Numeric.isMultiple(49, 8)).toBe(false);
    });

    Vitest.it('should return true when self equals of', () => {
      Vitest.expect(Numeric.isMultiple(5, 5)).toBe(true);
      Vitest.expect(Numeric.isMultiple(10, 10)).toBe(true);
      Vitest.expect(Numeric.isMultiple(1, 1)).toBe(true);
    });

    Vitest.it('should return true when self is zero and of is non-zero', () => {
      Vitest.expect(Numeric.isMultiple(0, 5)).toBe(true);
      Vitest.expect(Numeric.isMultiple(0, 10)).toBe(true);
      Vitest.expect(Numeric.isMultiple(0, -3)).toBe(true);
    });

    Vitest.it('should work with negative numbers', () => {
      Vitest.expect(Numeric.isMultiple(-9, 3)).toBe(true);
      Vitest.expect(Numeric.isMultiple(9, -3)).toBe(true);
      Vitest.expect(Numeric.isMultiple(-9, -3)).toBe(true);
      Vitest.expect(Numeric.isMultiple(9, -4)).toBe(false);
    });

    Vitest.it('should work with decimal numbers', () => {
      Vitest.expect(Numeric.isMultiple(10, 2.5)).toBe(true);
      Vitest.expect(Numeric.isMultiple(2.5, 0.5)).toBe(true);
      Vitest.expect(Numeric.isMultiple(4.5, 1.5)).toBe(true);
      Vitest.expect(Numeric.isMultiple(9, 2.5)).toBe(false);
    });

    Vitest.it('should return false when of is zero and self is non-zero', () => {
      Vitest.expect(Numeric.isMultiple(5, 0)).toBe(false);
      Vitest.expect(Numeric.isMultiple(10, 0)).toBe(false);
      Vitest.expect(Numeric.isMultiple(-3, 0)).toBe(false);
    });
  });

  Vitest.describe('curried usage', () => {
    Vitest.it('should return a function when called with of only', () => {
      const isMultipleOf3 = Numeric.isMultiple(3);
      Vitest.expect(typeof isMultipleOf3).toBe('function');
    });

    Vitest.it('should work with curried function', () => {
      const isMultipleOf3 = Numeric.isMultiple(3);
      Vitest.expect(isMultipleOf3(9)).toBe(true);
      Vitest.expect(isMultipleOf3(12)).toBe(true);
      Vitest.expect(isMultipleOf3(15)).toBe(true);
      Vitest.expect(isMultipleOf3(3)).toBe(true);
      Vitest.expect(isMultipleOf3(10)).toBe(false);
      Vitest.expect(isMultipleOf3(11)).toBe(false);
    });

    Vitest.it('should work with curried function and negative numbers', () => {
      const isMultipleOfNegative = Numeric.isMultiple(-3);
      Vitest.expect(isMultipleOfNegative(-9)).toBe(true);
      Vitest.expect(isMultipleOfNegative(9)).toBe(true);
      Vitest.expect(isMultipleOfNegative(10)).toBe(false);
    });

    Vitest.it('should work with curried function and zero', () => {
      const isMultipleOfZero = Numeric.isMultiple(0);
      Vitest.expect(isMultipleOfZero(5)).toBe(false);
      Vitest.expect(isMultipleOfZero(10)).toBe(false);
      Vitest.expect(isMultipleOfZero(0)).toBe(false);
    });

    Vitest.it('should work with curried function and decimal numbers', () => {
      const isMultipleOf2_5 = Numeric.isMultiple(2.5);
      Vitest.expect(isMultipleOf2_5(10)).toBe(true);
      Vitest.expect(isMultipleOf2_5(5)).toBe(true);
      Vitest.expect(isMultipleOf2_5(9)).toBe(false);
    });
  });

  Vitest.describe('edge cases', () => {
    Vitest.it('should handle very large numbers', () => {
      const largeNumber = 1000000;
      Vitest.expect(Numeric.isMultiple(largeNumber, 1000)).toBe(true);
      Vitest.expect(Numeric.isMultiple(largeNumber, 1000000)).toBe(true);
      Vitest.expect(Numeric.isMultiple(largeNumber, 999)).toBe(false);
    });

    Vitest.it('should handle very small numbers', () => {
      const smallNumber = 0.01;
      Vitest.expect(Numeric.isMultiple(smallNumber, 0.001)).toBe(true);
      Vitest.expect(Numeric.isMultiple(smallNumber, 0.005)).toBe(true);
      Vitest.expect(Numeric.isMultiple(smallNumber, 0.003)).toBe(false);
    });

    Vitest.it('should handle one as multiple', () => {
      Vitest.expect(Numeric.isMultiple(5, 1)).toBe(true);
      Vitest.expect(Numeric.isMultiple(100, 1)).toBe(true);
      Vitest.expect(Numeric.isMultiple(-7, 1)).toBe(true);
      Vitest.expect(Numeric.isMultiple(0, 1)).toBe(true);
    });

    Vitest.it('should handle self less than of', () => {
      Vitest.expect(Numeric.isMultiple(5, 10)).toBe(false);
      Vitest.expect(Numeric.isMultiple(10, 20)).toBe(false);
      Vitest.expect(Numeric.isMultiple(50, 100)).toBe(false);
    });
  });
});

Vitest.describe('[types] Numeric.isMultiple', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Numeric.isMultiple;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should accept number and number in non-curried form', () => {
    type Test = typeof Numeric.isMultiple;
    Vitest.expectTypeOf<Test>().toMatchTypeOf<(self: number, of: number) => boolean>();
  });

  Vitest.it('should accept number in curried form', () => {
    type Test = typeof Numeric.isMultiple;
    Vitest.expectTypeOf<Test>().toMatchTypeOf<(of: number) => (self: number) => boolean>();
  });

  Vitest.it('should return boolean for non-curried usage', () => {
    const result = Numeric.isMultiple(9, 3);
    Vitest.expectTypeOf(result).toEqualTypeOf<boolean>();
  });

  Vitest.it('should return function for curried usage', () => {
    const curriedFn = Numeric.isMultiple(3);
    Vitest.expectTypeOf(curriedFn).toEqualTypeOf<(self: number) => boolean>();
  });

  Vitest.it('should work with const assertions', () => {
    const of = 3 as const;
    const result = Numeric.isMultiple(9, of);
    Vitest.expectTypeOf(result).toEqualTypeOf<boolean>();

    const curriedFn = Numeric.isMultiple(of);
    Vitest.expectTypeOf(curriedFn).toEqualTypeOf<(self: number) => boolean>();
  });
});
