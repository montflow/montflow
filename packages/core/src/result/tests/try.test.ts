import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[runtime] Result.try', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.try).toBeDefined();
  });

  Vitest.it('should wrap a function return value in Ok', () => {
    const result = Result.try(() => 42);

    Vitest.expect(Result.isOk(result)).toBe(true);
    Vitest.expect(Result.unwrap(result)).toBe(42);
  });

  Vitest.it('should capture a thrown error as Err', () => {
    const failure = new Error('boom');
    const result = Result.try((): number => {
      throw failure;
    });

    if (Result.isErr(result)) {
      Vitest.expectTypeOf(result.error).toEqualTypeOf<unknown>();
      Vitest.expect(result.error).toBe(failure);
    } else {
      Vitest.expect.unreachable('try should have captured the throw');
    }
  });

  Vitest.it('should support branches with typed catch mapping', () => {
    const result = Result.try({
      try: (): number => {
        throw 'oops';
      },
      catch: (error) => `caught: ${String(error)}`,
    });

    if (Result.isErr(result)) {
      Vitest.expect(result.error).toBe('caught: oops');
    } else {
      Vitest.expect.unreachable('try should have captured the throw');
    }
  });
});

Vitest.describe('[types] Result.try', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Result.try;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
