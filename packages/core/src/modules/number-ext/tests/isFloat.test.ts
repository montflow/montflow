import * as Vitest from '@effect/vitest';

import * as NumberExt from '../index.js';

Vitest.describe('NumberExt.isFloat types', () => {
  Vitest.it('narrows unknown to number', () => {
    const thing: unknown = 1.5;
    if (NumberExt.isFloat(thing)) {
      Vitest.expectTypeOf(thing).toEqualTypeOf<number>();
    }
  });
});

Vitest.describe('NumberExt.isFloat runtime', () => {
  Vitest.it('returns true for non-integer numbers', () => {
    Vitest.expect(NumberExt.isFloat(3.14)).toBe(true);
    Vitest.expect(NumberExt.isFloat(0.1)).toBe(true);
    Vitest.expect(NumberExt.isFloat(-2.5)).toBe(true);
  });

  Vitest.it('returns false for integers', () => {
    Vitest.expect(NumberExt.isFloat(0)).toBe(false);
    Vitest.expect(NumberExt.isFloat(42)).toBe(false);
    Vitest.expect(NumberExt.isFloat(-1)).toBe(false);
  });

  Vitest.it('returns false for NaN', () => {
    Vitest.expect(NumberExt.isFloat(Number.NaN)).toBe(false);
  });

  Vitest.it('returns false for non-numbers', () => {
    Vitest.expect(NumberExt.isFloat(null)).toBe(false);
    Vitest.expect(NumberExt.isFloat(undefined)).toBe(false);
    Vitest.expect(NumberExt.isFloat('3.14')).toBe(false);
    Vitest.expect(NumberExt.isFloat([])).toBe(false);
    Vitest.expect(NumberExt.isFloat({})).toBe(false);
    Vitest.expect(NumberExt.isFloat(true)).toBe(false);
    Vitest.expect(NumberExt.isFloat(42n)).toBe(false);
  });
});
