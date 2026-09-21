import { Option, Result } from 'effect';
import * as Vitest from '@effect/vitest';

import * as Float from '../index.js';

Vitest.describe('Float.make types', () => {
  Vitest.it('returns the branded float', () => {
    Vitest.expectTypeOf(Float.make(1.5)).toEqualTypeOf<Float.Float>();
  });
});

Vitest.describe('Float.make runtime', () => {
  Vitest.it('brands valid floats', () => {
    Vitest.expect(Float.make(1.5)).toBe(1.5);
  });

  Vitest.it('throws on integers and non-finite values', () => {
    Vitest.expect(() => Float.make(1)).toThrow();
    Vitest.expect(() => Float.make(Number.POSITIVE_INFINITY)).toThrow();
  });

  Vitest.it('exposes option, result, and is forms', () => {
    Vitest.expect(Option.isSome(Float.make.option(1.5))).toBe(true);
    Vitest.expect(Option.isNone(Float.make.option(1))).toBe(true);
    Vitest.expect(Result.isSuccess(Float.make.result(1.5))).toBe(true);
    Vitest.expect(Result.isFailure(Float.make.result(1))).toBe(true);
    Vitest.expect(Float.make.is(1.5)).toBe(true);
    Vitest.expect(Float.make.is(1)).toBe(false);
  });
});
