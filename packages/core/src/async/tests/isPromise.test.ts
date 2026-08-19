import * as Vitest from 'vitest';

import * as Async from '../index.js';

Vitest.describe('[runtime] Async.isPromise', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Async.isPromise).toBeDefined();
  });

  Vitest.it('should return true for a Promise instance', () => {
    const promise = new Promise((resolve) => resolve(true));
    Vitest.expect(Async.isPromise(promise)).toBe(true);
  });

  Vitest.it('should return true for an object that mimics a Promise', () => {
    const promiseLike = {
      // oxlint-disable-next-line no-thenable -- intentional fixture: a thenable used to test isPromise detection.
      then: () => {},
      catch: () => {},
    };
    Vitest.expect(Async.isPromise(promiseLike)).toBe(true);
  });

  Vitest.it('should return false for a plain object', () => {
    const obj = { key: 'value' };
    Vitest.expect(Async.isPromise(obj)).toBe(false);
  });

  Vitest.it('should return false for a function', () => {
    const func = () => {};
    Vitest.expect(Async.isPromise(func)).toBe(false);
  });

  Vitest.it('should return false for null', () => {
    Vitest.expect(Async.isPromise(null)).toBe(false);
  });

  Vitest.it('should return false for undefined', () => {
    Vitest.expect(Async.isPromise(undefined)).toBe(false);
  });

  Vitest.it('should return false for a number', () => {
    const num = 42;
    Vitest.expect(Async.isPromise(num)).toBe(false);
  });

  Vitest.it('should return false for a string', () => {
    const str = 'test';
    Vitest.expect(Async.isPromise(str)).toBe(false);
  });

  Vitest.it('should return true for a Promise resolved with a value', async () => {
    const promise = Promise.resolve('test');
    Vitest.expect(Async.isPromise(promise)).toBe(true);

    const result = await promise;
    Vitest.expect(result).toBe('test');
  });

  Vitest.it('should return true for a Promise rejected with a value', async () => {
    const promise = Promise.reject(new Error('test'));
    Vitest.expect(Async.isPromise(promise)).toBe(true);

    try {
      await promise;
    } catch (error) {
      // SAFETY: the test itself rejects the promise with `new Error("test")`,
      // so the caught value is that Error.
      Vitest.expect((error as Error).message).toBe('test');
    }
  });
});

Vitest.describe('[types] Async.isPromise', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Async.isPromise;

    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
