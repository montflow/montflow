import * as Vitest from '@effect/vitest';

import * as RecordExt from '../index.js';

Vitest.describe('RecordExt.keyefy runtime', () => {
  Vitest.it('serializes a flat struct with sorted keys', () => {
    Vitest.expect(RecordExt.keyefy({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  Vitest.it('is deterministic regardless of key insertion order', () => {
    Vitest.expect(RecordExt.keyefy({ a: 1, b: 2 })).toBe(RecordExt.keyefy({ b: 2, a: 1 }));
  });

  Vitest.it('flattens nested structs before serializing', () => {
    Vitest.expect(RecordExt.keyefy({ nested: { z: 1, a: 2 } })).toBe('{"nested.a":2,"nested.z":1}');
  });

  Vitest.it('serializes Date leaves as ISO strings', () => {
    const date = new Date('2020-01-02T03:04:05.000Z');
    Vitest.expect(RecordExt.keyefy({ d: date })).toBe('{"d":"2020-01-02T03:04:05.000Z"}');
  });

  Vitest.it('throws for symbol leaves', () => {
    Vitest.expect(() => RecordExt.keyefy({ s: Symbol('x') })).toThrow(TypeError);
  });

  Vitest.it('throws for bigint leaves', () => {
    Vitest.expect(() => RecordExt.keyefy({ b: 1n })).toThrow(TypeError);
  });

  Vitest.it('throws for function leaves', () => {
    Vitest.expect(() => RecordExt.keyefy({ f: () => 1 })).toThrow(TypeError);
  });
});
