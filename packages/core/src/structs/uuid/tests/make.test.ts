import { Option, Result } from 'effect';
import * as Vitest from '@effect/vitest';

import * as Uuid from '../index.js';

const VALID = '110ec58a-a0f2-4ac4-8393-c866d813b8d1';

Vitest.describe('Uuid.make types', () => {
  Vitest.it('returns the branded uuid', () => {
    Vitest.expectTypeOf(Uuid.make(VALID)).toEqualTypeOf<Uuid.Uuid>();
  });
});

Vitest.describe('Uuid.make runtime', () => {
  Vitest.it('brands valid UUIDs', () => {
    Vitest.expect(Uuid.make(VALID)).toBe(VALID);
  });

  Vitest.it('throws on invalid input', () => {
    Vitest.expect(() => Uuid.make('not-a-uuid')).toThrow();
  });

  Vitest.it('exposes option, result, and is forms', () => {
    Vitest.expect(Option.isSome(Uuid.make.option(VALID))).toBe(true);
    Vitest.expect(Option.isNone(Uuid.make.option('not-a-uuid'))).toBe(true);
    Vitest.expect(Result.isSuccess(Uuid.make.result(VALID))).toBe(true);
    Vitest.expect(Result.isFailure(Uuid.make.result('not-a-uuid'))).toBe(true);
    Vitest.expect(Uuid.make.is(VALID)).toBe(true);
    Vitest.expect(Uuid.make.is('not-a-uuid')).toBe(false);
  });
});
