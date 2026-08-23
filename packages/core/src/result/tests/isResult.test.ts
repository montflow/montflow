import * as Vitest from 'vitest';

import * as Domain from '../../domain/index.js';
import * as Result from '../index.js';

Vitest.describe('[runtime] Result.isResult', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.isResult).toBeDefined();
  });

  Vitest.it('should return true for an Ok value', () => {
    Vitest.expect(Result.isResult(Result.ok(1))).toBe(true);
  });

  Vitest.it('should return true for an Err value', () => {
    Vitest.expect(Result.isResult(Result.err('e'))).toBe(true);
  });

  Vitest.it('should reject values with a wrong domain Id', () => {
    const impostor = { ...Result.ok(1), [Domain.Id]: 'maybe' };

    Vitest.expect(Result.isResult(impostor)).toBe(false);
  });

  Vitest.it('should reject values with a wrong tag', () => {
    const impostor = {
      [Domain.Id]: Result.Id,
      [Domain.Tag]: 'neither',
      value: 1,
    };

    Vitest.expect(Result.isResult(impostor)).toBe(false);
  });

  Vitest.it('should reject plain objects and non-objects', () => {
    Vitest.expect(Result.isResult(null)).toBe(false);
    Vitest.expect(Result.isResult(undefined)).toBe(false);
    Vitest.expect(Result.isResult({ [Domain.Id]: Result.Id })).toBe(false);
    Vitest.expect(Result.isResult('ok')).toBe(false);
  });
});

Vitest.describe('[types] Result.isResult', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Result.isResult;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should narrow to Result<unknown, unknown>', () => {
    const thing: unknown = Result.ok(1);

    if (Result.isResult(thing)) {
      Vitest.expectTypeOf(thing).toEqualTypeOf<Result.Result<unknown, unknown>>();
    }
  });
});
