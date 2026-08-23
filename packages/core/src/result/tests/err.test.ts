import * as Vitest from 'vitest';

import * as Domain from '../../domain/index.js';
import * as Result from '../index.js';

Vitest.describe('[runtime] Result.err', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.err).toBeDefined();
  });

  Vitest.it('should wrap an error payload in an Err variant', () => {
    const result = Result.err('boom');

    Vitest.expect(result['_id']).toBe('result');
    Vitest.expect(result['_tag']).toBe('err');
    Vitest.expect(result.error).toBe('boom');
  });

  Vitest.it('should support undefined error payloads without dropping them', () => {
    const result = Result.err(undefined);

    Vitest.expect(Result.isErr(result)).toBe(true);
    Vitest.expect(result.error).toBeUndefined();
  });

  Vitest.it('should default the error to undefined when called bare', () => {
    const result = Result.err();

    Vitest.expect(Result.isErr(result)).toBe(true);
    Vitest.expect(result.error).toBeUndefined();
  });
});

Vitest.describe('[types] Result.err', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Result.err;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should produce Err<E> for a given payload', () => {
    Vitest.expectTypeOf(Result.err('boom')).toEqualTypeOf<Result.Err<string>>();
    Vitest.expectTypeOf(Result.err(404)).toEqualTypeOf<Result.Err<number>>();
    Vitest.expectTypeOf(Result.err()).toEqualTypeOf<Result.Err<never>>();
  });

  Vitest.it('should expose the documented variant shape', () => {
    type Test = Result.Err<string>;
    Vitest.expectTypeOf<Test>().toEqualTypeOf<{
      readonly [Domain.Id]: Result.Id;
      readonly [Domain.Tag]: Result.ErrTag;
      readonly error: string;
    }>();
  });
});
