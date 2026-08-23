import * as Vitest from 'vitest';

import * as Domain from '../../domain/index.js';
import * as Result from '../index.js';

Vitest.describe('[runtime] Result.isErr', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.isErr).toBeDefined();
  });

  Vitest.it('should return true for an Err value', () => {
    Vitest.expect(Result.isErr(Result.err('e'))).toBe(true);
  });

  Vitest.it('should return false for an Ok value', () => {
    Vitest.expect(Result.isErr(Result.ok(1))).toBe(false);
  });

  Vitest.it('should reject values with a wrong domain Id', () => {
    const impostor = {
      [Domain.Id]: 'maybe',
      [Domain.Tag]: Result.ErrTag,
      error: 'e',
    };

    Vitest.expect(Result.isErr(impostor)).toBe(false);
  });

  Vitest.it('should reject values with a wrong tag', () => {
    const impostor = {
      [Domain.Id]: Result.Id,
      [Domain.Tag]: Result.OkTag,
      error: 'e',
    };

    Vitest.expect(Result.isErr(impostor)).toBe(false);
  });

  Vitest.it('should reject objects missing the error key', () => {
    const impostor = {
      [Domain.Id]: Result.Id,
      [Domain.Tag]: Result.ErrTag,
      value: 'e',
    };

    Vitest.expect(Result.isErr(impostor)).toBe(false);
  });

  Vitest.it('should reject Err-shaped objects with extra keys', () => {
    const impostor = { ...Result.err('e'), extra: true };

    Vitest.expect(Result.isErr(impostor)).toBe(false);
  });

  Vitest.it('should reject non-objects', () => {
    Vitest.expect(Result.isErr(null)).toBe(false);
    Vitest.expect(Result.isErr(undefined)).toBe(false);
    Vitest.expect(Result.isErr('err')).toBe(false);
    Vitest.expect(Result.isErr({ error: 'e' })).toBe(false);
  });
});

Vitest.describe('[types] Result.isErr', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Result.isErr;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should narrow to the caller-asserted error type', () => {
    const self: Result.Result<number, string> = Result.err('e');

    if (Result.isErr(self)) {
      Vitest.expectTypeOf(self).toEqualTypeOf<Result.Err<string>>();
      Vitest.expect(self.error).toBe('e');
    }
  });
});
