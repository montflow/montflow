import { Option, Result } from 'effect';
import * as Vitest from '@effect/vitest';

import * as PositiveInt from '../index.js';

Vitest.describe('PositiveInt.make types', () => {
  Vitest.it('returns the composed branded type', () => {
    Vitest.expectTypeOf(PositiveInt.make(1)).toEqualTypeOf<PositiveInt.PositiveInt>();
  });
});

Vitest.describe('PositiveInt.make runtime', () => {
  Vitest.it('brands positive integers', () => {
    Vitest.expect(PositiveInt.make(5)).toBe(5);
  });

  Vitest.it('throws on zero, negatives, and non-integers', () => {
    Vitest.expect(() => PositiveInt.make(0)).toThrow();
    Vitest.expect(() => PositiveInt.make(-5)).toThrow();
    Vitest.expect(() => PositiveInt.make(5.5)).toThrow();
  });

  Vitest.it('exposes option, result, and is forms', () => {
    Vitest.expect(Option.isSome(PositiveInt.make.option(5))).toBe(true);
    Vitest.expect(Option.isNone(PositiveInt.make.option(5.5))).toBe(true);
    Vitest.expect(Result.isSuccess(PositiveInt.make.result(5))).toBe(true);
    Vitest.expect(Result.isFailure(PositiveInt.make.result(-5))).toBe(true);
    Vitest.expect(PositiveInt.make.is(5)).toBe(true);
    Vitest.expect(PositiveInt.make.is(5.5)).toBe(false);
  });
});
