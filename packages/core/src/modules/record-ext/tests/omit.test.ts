import * as Vitest from '@effect/vitest';

import * as RecordExt from '../index.js';

Vitest.describe('RecordExt.omit types', () => {
  Vitest.it('removes the omitted keys in data-first form', () => {
    const input = { a: 1, b: 2, c: 3 };
    Vitest.expectTypeOf(RecordExt.omit(input, ['b'])).toEqualTypeOf<{ a: number; c: number }>();
  });

  Vitest.it('removes the omitted keys in data-last form', () => {
    Vitest.expectTypeOf(RecordExt.omit(['b'])({ a: 1, b: 2, c: 3 })).toEqualTypeOf<{
      a: number;
      c: number;
    }>();
  });
});

Vitest.describe('RecordExt.omit runtime', () => {
  Vitest.it('returns a new object without the specified keys', () => {
    Vitest.expect(RecordExt.omit({ a: 1, b: 2, c: 3 }, ['b'])).toStrictEqual({ a: 1, c: 3 });
  });

  Vitest.it('supports the data-last form', () => {
    Vitest.expect(RecordExt.omit(['a', 'c'])({ a: 1, b: 2, c: 3 })).toStrictEqual({ b: 2 });
  });

  Vitest.it('returns a copy when no keys are omitted', () => {
    const input = { a: 1, b: 2 };
    const result = RecordExt.omit(input, []);
    Vitest.expect(result).toStrictEqual(input);
    Vitest.expect(result).not.toBe(input);
  });

  Vitest.it('silently ignores keys absent from the input', () => {
    const input: { a: number; b?: number } = { a: 1 };
    Vitest.expect(RecordExt.omit(input, ['b'])).toStrictEqual({ a: 1 });
  });

  Vitest.it('does not mutate the input', () => {
    const input = { a: 1, b: 2 };
    RecordExt.omit(input, ['a']);
    Vitest.expect(input).toStrictEqual({ a: 1, b: 2 });
  });
});
