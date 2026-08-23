import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[runtime] Result.tryPromise', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.tryPromise).toBeDefined();
  });

  Vitest.it('should resolve a lazy async function into ok(value)', async () => {
    const result = await Result.tryPromise(async () => 42);

    Vitest.expect(Result.isOk(result)).toBe(true);
    Vitest.expect(Result.unwrap(result)).toBe(42);
  });

  Vitest.it('should capture a lazy function rejection as err(reason)', async () => {
    const failure = new Error('boom');
    const result = await Result.tryPromise(async (): Promise<number> => {
      throw failure;
    });

    if (Result.isErr(result)) {
      Vitest.expectTypeOf(result.error).toEqualTypeOf<unknown>();
      Vitest.expect(result.error).toBe(failure);
    } else {
      Vitest.expect.unreachable('tryPromise should have captured the rejection');
    }
  });

  Vitest.it('should accept an already-running promise that resolves', async () => {
    const promise = Promise.resolve('ready');
    const result = await Result.tryPromise(promise);

    Vitest.expect(Result.isOk(result)).toBe(true);
    Vitest.expect(Result.unwrap(result)).toBe('ready');
  });

  Vitest.it('should accept an already-running promise that rejects', async () => {
    let reject!: (reason: unknown) => void;
    const promise = new Promise<number>((_, _reject) => {
      reject = _reject;
    });
    const resultPromise = Result.tryPromise(promise);

    reject(new Error('teardown'));

    const result = await resultPromise;

    if (Result.isErr(result)) {
      Vitest.expect((result.error as Error).message).toBe('teardown');
    } else {
      Vitest.expect.unreachable('tryPromise should have captured the rejection');
    }
  });

  Vitest.it('should only start the computation when given a lazy function', async () => {
    let started = false;
    const start = () => {
      started = true;
      return Promise.resolve(1);
    };

    Vitest.expect(started).toBe(false);

    const resultPromise = Result.tryPromise(start);

    // A lazy function is invoked by tryPromise itself, not before the call.
    Vitest.expect(started).toBe(true);

    const result = await resultPromise;

    Vitest.expect(Result.unwrap(result)).toBe(1);
  });
});

Vitest.describe('[types] Result.tryPromise', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Result.tryPromise;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should return a promise of Result<V, unknown>', async () => {
    const promise = Result.tryPromise(async () => 42);
    type Test = Awaited<typeof promise>;
    Vitest.expectTypeOf<Test>().toEqualTypeOf<Result.Result<number, unknown>>();
  });
});
