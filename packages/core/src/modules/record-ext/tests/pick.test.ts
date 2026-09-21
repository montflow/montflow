import * as Vitest from '@effect/vitest';

import * as RecordExt from '../index.js';

Vitest.describe('RecordExt.pick types', () => {
  Vitest.it('returns the picked keys in data-first form', () => {
    const input = { a: 1, b: 2, c: 3 };
    Vitest.expectTypeOf(RecordExt.pick(input, ['a', 'c'])).toEqualTypeOf<{
      a: number;
      c: number;
    }>();
  });

  Vitest.it('returns the picked keys in data-last form', () => {
    Vitest.expectTypeOf(RecordExt.pick(['a', 'c'])({ a: 1, b: 2, c: 3 })).toEqualTypeOf<{
      a: number;
      c: number;
    }>();
  });
});

Vitest.describe('RecordExt.pick runtime', () => {
  Vitest.it('returns a new object with only the specified keys', () => {
    Vitest.expect(RecordExt.pick({ a: 1, b: 2, c: 3 }, ['a', 'c'])).toStrictEqual({ a: 1, c: 3 });
  });

  Vitest.it('supports the data-last form', () => {
    Vitest.expect(RecordExt.pick(['a', 'c'])({ a: 1, b: 2, c: 3 })).toStrictEqual({
      a: 1,
      c: 3,
    });
  });

  Vitest.it('returns an empty object when no keys are requested', () => {
    Vitest.expect(RecordExt.pick({ a: 1, b: 2 }, [])).toStrictEqual({});
  });

  Vitest.it('silently ignores keys absent from the input', () => {
    const input: { a: number; b?: number } = { a: 1 };
    Vitest.expect(RecordExt.pick(input, ['a', 'b'])).toStrictEqual({ a: 1 });
  });

  Vitest.it('keeps keys whose value is literally undefined', () => {
    const input: { a?: number; b: number } = { a: undefined, b: 2 };
    const result = RecordExt.pick(input, ['a']);
    Vitest.expect('a' in result).toBe(true);
    Vitest.expect(result).toStrictEqual({ a: undefined });
  });

  Vitest.it('does not mutate the input', () => {
    const input = { a: 1, b: 2 };
    RecordExt.pick(input, ['a']);
    Vitest.expect(input).toStrictEqual({ a: 1, b: 2 });
  });
});
