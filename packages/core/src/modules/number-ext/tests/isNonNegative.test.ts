import * as Vitest from '@effect/vitest';

import * as NumberExt from '../index.js';

Vitest.describe('NumberExt.isNonNegative runtime', () => {
  Vitest.it('returns true for zero and positive numbers', () => {
    Vitest.expect(NumberExt.isNonNegative(0)).toBe(true);
    Vitest.expect(NumberExt.isNonNegative(1)).toBe(true);
    Vitest.expect(NumberExt.isNonNegative(0.5)).toBe(true);
  });

  Vitest.it('returns false for negative numbers', () => {
    Vitest.expect(NumberExt.isNonNegative(-1)).toBe(false);
    Vitest.expect(NumberExt.isNonNegative(-0.5)).toBe(false);
  });

  Vitest.it('returns false for NaN', () => {
    Vitest.expect(NumberExt.isNonNegative(Number.NaN)).toBe(false);
  });
});
