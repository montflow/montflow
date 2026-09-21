import * as Vitest from '@effect/vitest';

import * as ArrayExt from '../index.js';

const isNumber = (thing: unknown): thing is number => typeof thing === 'number';
const isString = (thing: unknown): thing is string => typeof thing === 'string';

Vitest.describe('ArrayExt.isArrayOf types', () => {
  Vitest.it('narrows the input to Array<T> in data-first form', () => {
    const thing: unknown = [1, 2, 3];
    if (ArrayExt.isArrayOf(thing, isNumber)) {
      Vitest.expectTypeOf(thing).toEqualTypeOf<Array<number>>();
    }
  });

  Vitest.it('narrows the input to Array<T> in data-last form', () => {
    const thing: unknown = ['a', 'b'];
    if (ArrayExt.isArrayOf(isString)(thing)) {
      Vitest.expectTypeOf(thing).toEqualTypeOf<Array<string>>();
    }
  });

  Vitest.it('returns a boolean for both forms', () => {
    Vitest.expectTypeOf(ArrayExt.isArrayOf([1, 2, 3], isNumber)).toEqualTypeOf<boolean>();
    Vitest.expectTypeOf(ArrayExt.isArrayOf(isNumber)([1, 2, 3])).toEqualTypeOf<boolean>();
  });

  Vitest.it('rejects a plain boolean predicate', () => {
    // @ts-expect-error - isArrayOf requires a type-refinement guard, not a plain predicate
    ArrayExt.isArrayOf([1, 2, 3], (thing: unknown) => typeof thing === 'number');
  });
});

Vitest.describe('ArrayExt.isArrayOf runtime', () => {
  Vitest.it('returns true when every element satisfies the guard', () => {
    Vitest.expect(ArrayExt.isArrayOf([1, 2, 3], isNumber)).toBe(true);
    Vitest.expect(ArrayExt.isArrayOf(['a', 'b'], isString)).toBe(true);
  });

  Vitest.it('returns false when any element fails the guard', () => {
    Vitest.expect(ArrayExt.isArrayOf([1, '2', 3], isNumber)).toBe(false);
    Vitest.expect(ArrayExt.isArrayOf([1, 2, 3], isString)).toBe(false);
  });

  Vitest.it('returns true for an empty array', () => {
    Vitest.expect(ArrayExt.isArrayOf([], isNumber)).toBe(true);
  });

  Vitest.it('returns false for non-array values', () => {
    Vitest.expect(ArrayExt.isArrayOf('123', isNumber)).toBe(false);
    Vitest.expect(ArrayExt.isArrayOf(123, isNumber)).toBe(false);
    Vitest.expect(ArrayExt.isArrayOf(null, isNumber)).toBe(false);
    Vitest.expect(ArrayExt.isArrayOf(undefined, isNumber)).toBe(false);
    Vitest.expect(ArrayExt.isArrayOf({ 0: 1, length: 1 }, isNumber)).toBe(false);
    Vitest.expect(ArrayExt.isArrayOf(new Uint8Array([1, 2]), isNumber)).toBe(false);
  });

  Vitest.it('supports the data-last form', () => {
    Vitest.expect(ArrayExt.isArrayOf(isNumber)([1, 2, 3])).toBe(true);
    Vitest.expect(ArrayExt.isArrayOf(isNumber)([1, '2', 3])).toBe(false);
    Vitest.expect(ArrayExt.isArrayOf(isNumber)([])).toBe(true);
    Vitest.expect(ArrayExt.isArrayOf(isNumber)('123')).toBe(false);
  });
});
