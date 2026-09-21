import * as Vitest from '@effect/vitest';

import * as ArrayExt from '../index.js';

Vitest.describe('ArrayExt.isLast types', () => {
  Vitest.it('returns a boolean for both forms', () => {
    Vitest.expectTypeOf(ArrayExt.isLast([1, 2, 3], 3)).toEqualTypeOf<boolean>();
    Vitest.expectTypeOf(ArrayExt.isLast(3)([1, 2, 3])).toEqualTypeOf<boolean>();
  });

  Vitest.it('data-last form is a function over the array', () => {
    Vitest.expectTypeOf(ArrayExt.isLast(3)).toEqualTypeOf<
      (self: ReadonlyArray<number>) => boolean
    >();
  });
});

Vitest.describe('ArrayExt.isLast runtime', () => {
  Vitest.it('returns true when the element strictly equals the last element', () => {
    Vitest.expect(ArrayExt.isLast([10, 20, 30], 30)).toBe(true);
    Vitest.expect(ArrayExt.isLast(['only'], 'only')).toBe(true);
    Vitest.expect(ArrayExt.isLast([undefined], undefined)).toBe(true);
  });

  Vitest.it('returns false when the element is not the last element', () => {
    Vitest.expect(ArrayExt.isLast([10, 20, 30], 10)).toBe(false);
    Vitest.expect(ArrayExt.isLast([10, 20, 30], 20)).toBe(false);
    Vitest.expect(ArrayExt.isLast([10, 20, 30], 31)).toBe(false);
  });

  Vitest.it('returns false for an empty array', () => {
    Vitest.expect(ArrayExt.isLast([], 1)).toBe(false);
    Vitest.expect(ArrayExt.isLast([], undefined)).toBe(false);
  });

  Vitest.it('uses strict equality', () => {
    Vitest.expect(ArrayExt.isLast([1, 2, 3], '3')).toBe(false);
    Vitest.expect(ArrayExt.isLast([Number.NaN], Number.NaN)).toBe(false);
  });

  Vitest.it('compares objects by reference', () => {
    const shared = { id: 1 };
    Vitest.expect(ArrayExt.isLast([{ id: 0 }, shared], shared)).toBe(true);
    Vitest.expect(ArrayExt.isLast([{ id: 1 }], { id: 1 })).toBe(false);
  });

  Vitest.it('supports the data-last form', () => {
    Vitest.expect(ArrayExt.isLast(30)([10, 20, 30])).toBe(true);
    Vitest.expect(ArrayExt.isLast(10)([10, 20, 30])).toBe(false);
    Vitest.expect(ArrayExt.isLast(1)([])).toBe(false);
  });
});
