import * as Vitest from '@effect/vitest';

import * as NumberExt from '../index.js';

Vitest.describe('NumberExt.isNonPositive runtime', () => {
  Vitest.it('returns true for zero and negative numbers', () => {
    Vitest.expect(NumberExt.isNonPositive(0)).toBe(true);
    Vitest.expect(NumberExt.isNonPositive(-1)).toBe(true);
    Vitest.expect(NumberExt.isNonPositive(-0.5)).toBe(true);
  });

  Vitest.it('returns false for positive numbers', () => {
    Vitest.expect(NumberExt.isNonPositive(1)).toBe(false);
    Vitest.expect(NumberExt.isNonPositive(0.5)).toBe(false);
  });

  Vitest.it('returns false for NaN', () => {
    Vitest.expect(NumberExt.isNonPositive(Number.NaN)).toBe(false);
  });
});
