import * as Vitest from '@effect/vitest';

import * as NumberExt from '../index.js';

Vitest.describe('NumberExt.isInt types', () => {
  Vitest.it('narrows unknown to number', () => {
    const thing: unknown = 1;
    if (NumberExt.isInt(thing)) {
      Vitest.expectTypeOf(thing).toEqualTypeOf<number>();
    }
  });
});

Vitest.describe('NumberExt.isInt runtime', () => {
  Vitest.it('returns true for integers', () => {
    Vitest.expect(NumberExt.isInt(0)).toBe(true);
    Vitest.expect(NumberExt.isInt(42)).toBe(true);
    Vitest.expect(NumberExt.isInt(-1)).toBe(true);
    Vitest.expect(NumberExt.isInt(Number.MAX_SAFE_INTEGER)).toBe(true);
    Vitest.expect(NumberExt.isInt(Number.MIN_SAFE_INTEGER)).toBe(true);
  });

  Vitest.it('returns false for non-integer numbers', () => {
    Vitest.expect(NumberExt.isInt(3.14)).toBe(false);
    Vitest.expect(NumberExt.isInt(0.1)).toBe(false);
    Vitest.expect(NumberExt.isInt(-2.5)).toBe(false);
    Vitest.expect(NumberExt.isInt(Number.NaN)).toBe(false);
    Vitest.expect(NumberExt.isInt(Number.POSITIVE_INFINITY)).toBe(false);
  });

  Vitest.it('returns false for non-numbers', () => {
    Vitest.expect(NumberExt.isInt(null)).toBe(false);
    Vitest.expect(NumberExt.isInt(undefined)).toBe(false);
    Vitest.expect(NumberExt.isInt('42')).toBe(false);
    Vitest.expect(NumberExt.isInt([])).toBe(false);
    Vitest.expect(NumberExt.isInt({})).toBe(false);
    Vitest.expect(NumberExt.isInt(true)).toBe(false);
    Vitest.expect(NumberExt.isInt(42n)).toBe(false);
  });
});
