import * as Vitest from 'vitest';

import * as List from '../index.js';

Vitest.describe.concurrent('[runtime] List.from', () => {
  Vitest.it.concurrent('should be defined', () => {
    Vitest.expect(List.from).toBeDefined();
  });

  Vitest.it.concurrent('should be the same as native List.from', () => {
    Vitest.expect(List.from).toBe(globalThis.Array.from);
  });

  Vitest.it.concurrent('should convert array-like objects to arrays', () => {
    const arrayLike = { 0: 'a', 1: 'b', 2: 'c', length: 3 };
    const result = List.from(arrayLike);

    Vitest.expect(result).toEqual(['a', 'b', 'c']);
    Vitest.expect(globalThis.Array.isArray(result)).toBe(true);
  });

  Vitest.it.concurrent('should convert strings to character arrays', () => {
    const result = List.from('hello');
    Vitest.expect(result).toEqual(['h', 'e', 'l', 'l', 'o']);
  });

  Vitest.it.concurrent('should work with Set objects', () => {
    const set = new Set([1, 2, 3, 2, 1]);
    const result = List.from(set);

    Vitest.expect(result).toEqual([1, 2, 3]);
  });

  Vitest.it.concurrent('should work with Map objects', () => {
    const map = new Map([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    const result = List.from(map);

    Vitest.expect(result).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
  });

  Vitest.it.concurrent('should work with mapping function', () => {
    const result = List.from([1, 2, 3], (x) => x * 2);
    Vitest.expect(result).toEqual([2, 4, 6]);
  });

  Vitest.it.concurrent('should work with mapping function and thisArg', () => {
    const multiplier = { factor: 3 };
    const result = List.from(
      [1, 2, 3],
      function (x) {
        return x * this.factor;
      },
      multiplier,
    );

    Vitest.expect(result).toEqual([3, 6, 9]);
  });

  Vitest.it.concurrent('should create arrays from length objects', () => {
    const result = List.from({ length: 3 }, (_, i) => i);
    Vitest.expect(result).toEqual([0, 1, 2]);
  });

  Vitest.it.concurrent('should handle empty iterables', () => {
    const result = List.from([]);
    Vitest.expect(result).toEqual([]);
  });
});

Vitest.describe('[types] List.from', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof List.from;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should have the same type as native List.from', () => {
    type Test = typeof List.from;
    type Native = typeof globalThis.Array.from;
    Vitest.expectTypeOf<Test>().toEqualTypeOf<Native>();
  });
});
