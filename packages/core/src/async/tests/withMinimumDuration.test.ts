import * as Vitest from "vitest";

import * as Async from "../index.js";

Vitest.describe.concurrent("[runtime] Async.withMinimumDuration", () => {
  Vitest.it.concurrent("should be defined", () => {
    Vitest.expect(Async.withMinimumDuration).toBeDefined();
  });

  Vitest.it.concurrent(
    "should resolve with the result of the given promise after the specified delay",
    async () => {
      const duration = 200;
      const expectedValue = "test value";

      const fn = async () => {
        return expectedValue;
      };

      const start = Date.now();
      const value = await Async.withMinimumDuration(duration, fn);
      const end = Date.now();
      const elapsed = end - start;

      Vitest.expect(value).toBe(expectedValue);
      Vitest.expect(elapsed).toBeGreaterThanOrEqual(duration);
    }
  );

  Vitest.it.concurrent(
    "should resolve with the result even if the promise resolves faster than the delay",
    async () => {
      const duration = 500;
      const expectedValue = 42;

      const fn = async () => {
        return expectedValue;
      };

      const start = Date.now();
      const value = await Async.withMinimumDuration(duration, fn);
      const end = Date.now();
      const elapsed = end - start;

      Vitest.expect(value).toBe(expectedValue);
      Vitest.expect(elapsed).toBeGreaterThanOrEqual(duration);
    }
  );

  Vitest.it.concurrent(
    "should resolve with the result of the promise if it takes longer than the delay",
    async () => {
      const duration = 100;
      const expectedValue = "delayed result";

      const fn = async () => {
        await new Promise(resolve => setTimeout(resolve, 300));
        return expectedValue;
      };

      const start = Date.now();
      const value = await Async.withMinimumDuration(duration, fn);
      const end = Date.now();
      const elapsed = end - start;

      Vitest.expect(value).toBe(expectedValue);
      Vitest.expect(elapsed).toBeGreaterThanOrEqual(300); // should match the longer delay from fn
    }
  );

  Vitest.it.concurrent("should reject if the provided promise rejects", async () => {
    const duration = 200;
    const errorMessage = "error occurred";

    const fn = async () => {
      throw new Error(errorMessage);
    };

    await Vitest.expect(Async.withMinimumDuration(duration, fn)).rejects.toThrow(errorMessage);
  });

  Vitest.it.concurrent(
    "should enforce the delay even when the promise resolves immediately",
    async () => {
      const duration = 250;
      const expectedValue = "instant result";

      const fn = async () => expectedValue;

      const start = Date.now();
      const value = await Async.withMinimumDuration(duration, fn);
      const end = Date.now();
      const elapsed = end - start;

      Vitest.expect(value).toBe(expectedValue);
      Vitest.expect(elapsed).toBeGreaterThanOrEqual(duration);
    }
  );
});

Vitest.describe("[types] Async.withMinimumDuration", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Async.withMinimumDuration;

    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
