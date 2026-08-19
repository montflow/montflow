import * as Vitest from 'vitest';

import * as List from '../index.js';

Vitest.describe('[runtime] List.isEmpty', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(List.isEmpty).toBeDefined();
  });

  Vitest.it('should return true for empty arrays', () => {
    Vitest.expect(List.isEmpty([])).toBe(true);
  });

  Vitest.it('should return false for non-empty arrays', () => {
    Vitest.expect(List.isEmpty([1])).toBe(false);
    Vitest.expect(List.isEmpty([1, 2, 3])).toBe(false);
    Vitest.expect(List.isEmpty(['a'])).toBe(false);
    Vitest.expect(List.isEmpty([null])).toBe(false);
    Vitest.expect(List.isEmpty([undefined])).toBe(false);
  });

  Vitest.it('should work with arrays of different types', () => {
    const mixedArray = [1, 'string', {}, [], true];
    Vitest.expect(List.isEmpty(mixedArray)).toBe(false);
    Vitest.expect(List.isEmpty([])).toBe(true);
  });
});

Vitest.describe('[types] List.isEmpty', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof List.isEmpty;

    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should maintain type narrowing', () => {
    const array: number[] = [];

    if (List.isEmpty(array)) {
      type Test = typeof array.length;
      type Expect = 0;
      Vitest.expectTypeOf<Test>().toEqualTypeOf<Expect>();
    }

    if (List.isEmpty(array)) {
      type Test = typeof array;
      type Expect = [];
      Vitest.expectTypeOf<Test>().toEqualTypeOf<Expect>();
    }
  });
});
