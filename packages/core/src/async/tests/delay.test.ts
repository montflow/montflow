import { describe, expect } from "vitest";
import { delay } from "..";

describe.concurrent("delay [runtime]", it => {
  it("should resolve after the specified delay", async () => {
    const ms = 100;
    const start = Date.now();

    await delay(ms);

    const end = Date.now();
    const elapsed = end - start;

    expect(elapsed).toBeGreaterThanOrEqual(ms);
  });

  it("should resolve with the provided value after the specified delay", async () => {
    const ms = 100;
    const expectedValue = "test";

    const value = await delay(ms, expectedValue);

    expect(value).toBe(expectedValue);
  });

  it("should resolve with undefined if no value is provided", async () => {
    const ms = 100;

    const value = await delay(ms);

    expect(value).toBeUndefined();
  });

  it("should resolve with a complex object after the specified delay", async () => {
    const ms = 200;
    const expectedValue = { key: "value" };

    const value = await delay(ms, expectedValue);

    expect(value).toEqual(expectedValue);
  });

  it("should not resolve earlier than the specified delay", async () => {
    const ms = 500;
    const start = Date.now();

    await delay(ms);

    const end = Date.now();
    const elapsed = end - start;

    expect(elapsed).toBeGreaterThanOrEqual(ms);
  });
});
