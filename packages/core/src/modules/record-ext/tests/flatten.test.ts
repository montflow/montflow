import * as Vitest from '@effect/vitest';

import * as RecordExt from '../index.js';

Vitest.describe('RecordExt.flatten types', () => {
  Vitest.it('produces dot-notation keys for nested objects', () => {
    Vitest.expectTypeOf<RecordExt.Flatten<{ a: { b: number }; c: string }>>().toEqualTypeOf<{
      'a.b': number;
      c: string;
    }>();
  });
});

Vitest.describe('RecordExt.flatten runtime', () => {
  Vitest.it('flattens nested objects into dot-notation keys', () => {
    Vitest.expect(RecordExt.flatten({ a: { b: 1 }, c: 2 })).toStrictEqual({ 'a.b': 1, c: 2 });
  });

  Vitest.it('flattens deeply nested objects', () => {
    Vitest.expect(RecordExt.flatten({ a: 1, b: { c: 2, d: { e: 3 } } })).toStrictEqual({
      a: 1,
      'b.c': 2,
      'b.d.e': 3,
    });
  });

  Vitest.it('uses array indices as key segments', () => {
    Vitest.expect(RecordExt.flatten({ list: [1, 2] })).toStrictEqual({ 'list.0': 1, 'list.1': 2 });
    Vitest.expect(RecordExt.flatten({ deep: { arr: [{ x: 1 }] } })).toStrictEqual({
      'deep.arr.0.x': 1,
    });
  });

  Vitest.it('treats null as a leaf', () => {
    Vitest.expect(RecordExt.flatten({ a: null })).toStrictEqual({ a: null });
  });

  Vitest.it('treats Date and function values as leaves', () => {
    const date = new Date('2020-01-01T00:00:00.000Z');
    const fn = () => 1;
    Vitest.expect(RecordExt.flatten({ d: date })).toStrictEqual({ d: date });
    Vitest.expect(RecordExt.flatten({ fn })).toStrictEqual({ fn });
  });

  Vitest.it('drops empty nested objects', () => {
    Vitest.expect(RecordExt.flatten({ a: {}, b: 1 })).toStrictEqual({ b: 1 });
  });

  Vitest.it('returns an empty object for an empty input', () => {
    Vitest.expect(RecordExt.flatten({})).toStrictEqual({});
  });
});
