import { Option, Result } from 'effect';
import * as Vitest from '@effect/vitest';

import * as PositiveNumber from '../index.js';

Vitest.describe('PositiveNumber.make types', () => {
  Vitest.it('returns the branded positive number', () => {
    Vitest.expectTypeOf(PositiveNumber.make(1)).toEqualTypeOf<PositiveNumber.PositiveNumber>();
  });
});

Vitest.describe('PositiveNumber.make runtime', () => {
  Vitest.it('brands positive finite numbers', () => {
    Vitest.expect(PositiveNumber.make(1.5)).toBe(1.5);
  });

  Vitest.it('throws on zero, negatives, and non-finite values', () => {
    Vitest.expect(() => PositiveNumber.make(0)).toThrow();
    Vitest.expect(() => PositiveNumber.make(-1)).toThrow();
    Vitest.expect(() => PositiveNumber.make(Number.POSITIVE_INFINITY)).toThrow();
  });

  Vitest.it('exposes option, result, and is forms', () => {
    Vitest.expect(Option.isSome(PositiveNumber.make.option(1))).toBe(true);
    Vitest.expect(Option.isNone(PositiveNumber.make.option(0))).toBe(true);
    Vitest.expect(Result.isSuccess(PositiveNumber.make.result(1))).toBe(true);
    Vitest.expect(Result.isFailure(PositiveNumber.make.result(-1))).toBe(true);
    Vitest.expect(PositiveNumber.make.is(1)).toBe(true);
    Vitest.expect(PositiveNumber.make.is(0)).toBe(false);
  });
});
