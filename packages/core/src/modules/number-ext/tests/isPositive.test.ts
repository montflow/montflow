import * as Vitest from '@effect/vitest';

import * as NumberExt from '../index.js';

Vitest.describe('NumberExt.isPositive runtime', () => {
  Vitest.it('returns true for positive numbers', () => {
    Vitest.expect(NumberExt.isPositive(1)).toBe(true);
    Vitest.expect(NumberExt.isPositive(0.5)).toBe(true);
  });

  Vitest.it('returns false for zero and negative numbers', () => {
    Vitest.expect(NumberExt.isPositive(0)).toBe(false);
    Vitest.expect(NumberExt.isPositive(-1)).toBe(false);
    Vitest.expect(NumberExt.isPositive(-0.5)).toBe(false);
  });

  Vitest.it('returns false for NaN', () => {
    Vitest.expect(NumberExt.isPositive(Number.NaN)).toBe(false);
  });
});
