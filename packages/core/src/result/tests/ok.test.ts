import * as Vitest from 'vitest';

import * as Domain from '../../domain/index.js';
import * as Result from '../index.js';

Vitest.describe('[runtime] Result.ok', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.ok).toBeDefined();
  });

  Vitest.it('should wrap a value payload in an Ok variant', () => {
    const result = Result.ok(42);

    Vitest.expect(result['_id']).toBe('result');
    Vitest.expect(result['_tag']).toBe('ok');
    Vitest.expect(result.value).toBe(42);
  });

  Vitest.it('should support undefined value payloads without dropping them', () => {
    const result = Result.ok(undefined);

    Vitest.expect(Result.isOk(result)).toBe(true);
    Vitest.expect(result.value).toBeUndefined();
  });

  Vitest.it('should default the value to undefined when called bare', () => {
    const result = Result.ok();

    Vitest.expect(Result.isOk(result)).toBe(true);
    Vitest.expect(result.value).toBeUndefined();
  });
});

Vitest.describe('[types] Result.ok', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Result.ok;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should produce Ok<V> for a given payload', () => {
    Vitest.expectTypeOf(Result.ok(42)).toEqualTypeOf<Result.Ok<number>>();
    Vitest.expectTypeOf(Result.ok('hi')).toEqualTypeOf<Result.Ok<string>>();
    Vitest.expectTypeOf(Result.ok()).toEqualTypeOf<Result.Ok<never>>();
  });

  Vitest.it('should expose the documented variant shape', () => {
    type Test = Result.Ok<string>;
    Vitest.expectTypeOf<Test>().toEqualTypeOf<{
      readonly [Domain.Id]: Result.Id;
      readonly [Domain.Tag]: Result.OkTag;
      readonly value: string;
    }>();
  });
});
