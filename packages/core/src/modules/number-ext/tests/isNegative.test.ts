import * as Vitest from '@effect/vitest';

import * as NumberExt from '../index.js';

Vitest.describe('NumberExt.isNegative runtime', () => {
  Vitest.it('returns true for negative numbers', () => {
    Vitest.expect(NumberExt.isNegative(-1)).toBe(true);
    Vitest.expect(NumberExt.isNegative(-0.5)).toBe(true);
  });

  Vitest.it('returns false for zero and positive numbers', () => {
    Vitest.expect(NumberExt.isNegative(0)).toBe(false);
    Vitest.expect(NumberExt.isNegative(1)).toBe(false);
    Vitest.expect(NumberExt.isNegative(0.5)).toBe(false);
  });

  Vitest.it('returns false for NaN', () => {
    Vitest.expect(NumberExt.isNegative(Number.NaN)).toBe(false);
  });
});
