import * as Vitest from "vitest";

import * as Async from "../index.js";
import { expectElapsedTimeWithTolerance } from "./common.js";

Vitest.describe.concurrent("[runtime] Async.wait", () => {
  Vitest.it.concurrent("should be defined", () => {
    Vitest.expect(Async.wait).toBeDefined();
  });

  Vitest.it.concurrent("should wait for at least the specified duration", async () => {
    const delay = 50; // ms
    const startTime = Date.now();
    const result = await Async.wait(delay);
    const endTime = Date.now();
    const elapsed = endTime - startTime;

    expectElapsedTimeWithTolerance(elapsed, delay);
    Vitest.expect(result).toBeUndefined();
  });

  Vitest.it.concurrent("should resolve with the given value after the duration", async () => {
    const result = await Async.wait(10, "test-value");
    Vitest.expect(result).toBe("test-value");
  });

  Vitest.it.concurrent(
    "should resolve with the result of the given function after the duration",
    async () => {
      const result = await Async.wait(10, () => ({ id: 123 }));
      Vitest.expect(result).toEqual({ id: 123 });
    }
  );
});

Vitest.describe("[types] Async.wait", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Async.wait;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it("should return Promise<void> when no value is provided", () => {
    Vitest.expectTypeOf(Async.wait(10)).toEqualTypeOf<Promise<void>>();
  });

  Vitest.it("should return Promise<T> when a value of type T is provided", () => {
    Vitest.expectTypeOf(Async.wait(10, "hello")).toEqualTypeOf<Promise<string>>();
    Vitest.expectTypeOf(Async.wait(10, 123)).toEqualTypeOf<Promise<number>>();
    Vitest.expectTypeOf(Async.wait(10, { a: 1 })).toEqualTypeOf<Promise<{ a: number }>>();
  });

  Vitest.it("should return Promise<T> when a function returning T is provided", () => {
    Vitest.expectTypeOf(Async.wait(10, () => "hello")).toEqualTypeOf<Promise<string>>();
    Vitest.expectTypeOf(Async.wait(10, () => 123)).toEqualTypeOf<Promise<number>>();
  });

  Vitest.it("should require the first argument to be a number", () => {
    // @ts-expect-error -- Should not allow a string for the duration
    Async.wait("10", "value");
    Vitest.expectTypeOf(Async.wait).parameters.toMatchTypeOf<[number, ...unknown[]]>();
  });
});
