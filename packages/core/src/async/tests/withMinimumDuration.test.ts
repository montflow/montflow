import { describe, expect } from "vitest";
import { withMinimumDuration } from "..";

describe.concurrent("withMinimumDuration [runtime]", it => {
  it("should resolve with the result of the given promise after the specified delay", async () => {
    const duration = 200;
    const expectedValue = "test value";

    const fn = async () => {
      return expectedValue;
    };

    const start = Date.now();
    const value = await withMinimumDuration(fn, duration);
    const end = Date.now();
    const elapsed = end - start;

    expect(value).toBe(expectedValue);
    expect(elapsed).toBeGreaterThanOrEqual(duration);
  });

  it("should resolve with the result even if the promise resolves faster than the delay", async () => {
    const duration = 500;
    const expectedValue = 42;

    const fn = async () => {
      return expectedValue;
    };

    const start = Date.now();
    const value = await withMinimumDuration(fn, duration);
    const end = Date.now();
    const elapsed = end - start;

    expect(value).toBe(expectedValue);
    expect(elapsed).toBeGreaterThanOrEqual(duration);
  });

  it("should resolve with the result of the promise if it takes longer than the delay", async () => {
    const duration = 100;
    const expectedValue = "delayed result";

    const fn = async () => {
      await new Promise(resolve => setTimeout(resolve, 300));
      return expectedValue;
    };

    const start = Date.now();
    const value = await withMinimumDuration(fn, duration);
    const end = Date.now();
    const elapsed = end - start;

    expect(value).toBe(expectedValue);
    expect(elapsed).toBeGreaterThanOrEqual(300); // should match the longer delay from fn
  });

  it("should reject if the provided promise rejects", async () => {
    const duration = 200;
    const errorMessage = "error occurred";

    const fn = async () => {
      throw new Error(errorMessage);
    };

    await expect(withMinimumDuration(fn, duration)).rejects.toThrow(errorMessage);
  });

  it("should enforce the delay even when the promise resolves immediately", async () => {
    const duration = 250;
    const expectedValue = "instant result";

    const fn = async () => expectedValue;

    const start = Date.now();
    const value = await withMinimumDuration(fn, duration);
    const end = Date.now();
    const elapsed = end - start;

    expect(value).toBe(expectedValue);
    expect(elapsed).toBeGreaterThanOrEqual(duration);
  });
});
