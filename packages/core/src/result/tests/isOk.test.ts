import * as Vitest from 'vitest';

import * as Domain from '../../domain/index.js';
import * as Result from '../index.js';

Vitest.describe('[runtime] Result.isOk', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.isOk).toBeDefined();
  });

  Vitest.it('should return true for an Ok value', () => {
    Vitest.expect(Result.isOk(Result.ok(1))).toBe(true);
  });

  Vitest.it('should return false for an Err value', () => {
    Vitest.expect(Result.isOk(Result.err('e'))).toBe(false);
  });

  Vitest.it('should reject values with a wrong domain Id', () => {
    const impostor = {
      [Domain.Id]: 'maybe',
      [Domain.Tag]: Result.OkTag,
      value: 1,
    };

    Vitest.expect(Result.isOk(impostor)).toBe(false);
  });

  Vitest.it('should reject values with a wrong tag', () => {
    const impostor = {
      [Domain.Id]: Result.Id,
      [Domain.Tag]: Result.ErrTag,
      value: 1,
    };

    Vitest.expect(Result.isOk(impostor)).toBe(false);
  });

  Vitest.it('should reject objects missing the value key', () => {
    const impostor = {
      [Domain.Id]: Result.Id,
      [Domain.Tag]: Result.OkTag,
      error: 1,
    };

    Vitest.expect(Result.isOk(impostor)).toBe(false);
  });

  Vitest.it('should reject Ok-shaped objects with extra keys', () => {
    const impostor = { ...Result.ok(1), extra: true };

    Vitest.expect(Result.isOk(impostor)).toBe(false);
  });

  Vitest.it('should reject non-objects', () => {
    Vitest.expect(Result.isOk(null)).toBe(false);
    Vitest.expect(Result.isOk(undefined)).toBe(false);
    Vitest.expect(Result.isOk(1)).toBe(false);
    Vitest.expect(Result.isOk({ value: 1 })).toBe(false);
  });
});

Vitest.describe('[types] Result.isOk', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Result.isOk;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should narrow to the caller-asserted value type', () => {
    const self: Result.Result<number, string> = Result.ok(1);

    if (Result.isOk(self)) {
      Vitest.expectTypeOf(self).toEqualTypeOf<Result.Ok<number>>();
      Vitest.expect(self.value).toBe(1);
    }
  });
});
