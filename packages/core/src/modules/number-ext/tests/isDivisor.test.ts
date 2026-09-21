import * as Vitest from '@effect/vitest';

import * as NumberExt from '../index.js';

Vitest.describe('NumberExt.isDivisor runtime', () => {
  Vitest.it('returns true when self divides evenly into by', () => {
    Vitest.expect(NumberExt.isDivisor(3, 9)).toBe(true);
    Vitest.expect(NumberExt.isDivisor(3, 3)).toBe(true);
    Vitest.expect(NumberExt.isDivisor(1, 5)).toBe(true);
    Vitest.expect(NumberExt.isDivisor(-3, 9)).toBe(true);
  });

  Vitest.it('returns false when self does not divide evenly into by', () => {
    Vitest.expect(NumberExt.isDivisor(4, 9)).toBe(false);
    Vitest.expect(NumberExt.isDivisor(9, 3)).toBe(false);
  });

  Vitest.it('returns false when self is zero', () => {
    Vitest.expect(NumberExt.isDivisor(0, 5)).toBe(false);
  });

  Vitest.it('supports the data-last form', () => {
    const isDivisorOf12 = NumberExt.isDivisor(12);
    Vitest.expect(isDivisorOf12(3)).toBe(true);
    Vitest.expect(isDivisorOf12(5)).toBe(false);
  });
});
