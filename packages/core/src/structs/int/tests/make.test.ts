import { Option, Result } from 'effect';
import * as Vitest from '@effect/vitest';

import * as Int from '../index.js';

Vitest.describe('Int.make types', () => {
  Vitest.it('returns the branded integer', () => {
    Vitest.expectTypeOf(Int.make(1)).toEqualTypeOf<Int.Int>();
  });

  Vitest.it('makeUnsafe returns the branded integer without checks', () => {
    Vitest.expectTypeOf(Int.makeUnsafe(1)).toEqualTypeOf<Int.Int>();
  });
});

Vitest.describe('Int.make runtime', () => {
  Vitest.it('brands valid integers', () => {
    Vitest.expect(Int.make(42)).toBe(42);
  });

  Vitest.it('throws on invalid input', () => {
    Vitest.expect(() => Int.make(3.14)).toThrow();
    Vitest.expect(() => Int.make(Number.NaN)).toThrow();
  });

  Vitest.it('exposes option, result, and is forms', () => {
    Vitest.expect(Option.isSome(Int.make.option(1))).toBe(true);
    Vitest.expect(Option.isNone(Int.make.option(1.5))).toBe(true);
    Vitest.expect(Result.isSuccess(Int.make.result(1))).toBe(true);
    Vitest.expect(Result.isFailure(Int.make.result(1.5))).toBe(true);
    Vitest.expect(Int.make.is(1)).toBe(true);
    Vitest.expect(Int.make.is(1.5)).toBe(false);
  });

  Vitest.it('makeUnsafe brands without validation', () => {
    Vitest.expect(Int.makeUnsafe(7)).toBe(7);
  });
});
