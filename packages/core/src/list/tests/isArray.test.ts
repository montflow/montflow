import * as Vitest from 'vitest';

import * as List from '../index.js';

Vitest.describe.concurrent('[runtime] List.isArray', () => {
  Vitest.it.concurrent('should be defined', () => {
    Vitest.expect(List.isArray).toBeDefined();
  });

  Vitest.it.concurrent('should return true for arrays', () => {
    Vitest.expect(List.isArray([])).toBe(true);
    Vitest.expect(List.isArray([1, 2, 3])).toBe(true);
    Vitest.expect(List.isArray(['a', 'b', 'c'])).toBe(true);
  });

  Vitest.it.concurrent('should return false for non-array values', () => {
    Vitest.expect(List.isArray(null)).toBe(false);
    Vitest.expect(List.isArray(undefined)).toBe(false);
    Vitest.expect(List.isArray({})).toBe(false);
    Vitest.expect(List.isArray(42)).toBe(false);
    Vitest.expect(List.isArray('string')).toBe(false);
  });
});

Vitest.describe('[types] List.isArray', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof List.isArray;

    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should infer array item type if checking array', () => {
    const array = [1, 2, 3];

    if (List.isArray(array)) {
      type Test = typeof array;
      type Expected = Array<number>;
      Vitest.expectTypeOf<Test>().toEqualTypeOf<Expected>();
    }
  });

  Vitest.it('should infer array item type as unknown if thing is unknown', () => {
    const array: unknown = null;

    if (List.isArray(array)) {
      type Test = typeof array;
      type Expected = Array<unknown>;
      Vitest.expectTypeOf<Test>().toEqualTypeOf<Expected>();
    }
  });
});
