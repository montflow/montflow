import { describe, expect, it } from "vitest";
import { isPromise } from "..";

describe("isPromise [runtime]", () => {
  it("should return true for a Promise instance", () => {
    const promise = new Promise(resolve => resolve(true));
    expect(isPromise(promise)).toBe(true);
  });

  it("should return true for an object that mimics a Promise", () => {
    const promiseLike = {
      then: () => {},
      catch: () => {},
    };
    expect(isPromise(promiseLike)).toBe(true);
  });

  it("should return false for a plain object", () => {
    const obj = { key: "value" };
    expect(isPromise(obj)).toBe(false);
  });

  it("should return false for a function", () => {
    const func = () => {};
    expect(isPromise(func)).toBe(false);
  });

  it("should return false for null", () => {
    expect(isPromise(null)).toBe(false);
  });

  it("should return false for undefined", () => {
    expect(isPromise(undefined)).toBe(false);
  });

  it("should return false for a number", () => {
    const num = 42;
    expect(isPromise(num)).toBe(false);
  });

  it("should return false for a string", () => {
    const str = "test";
    expect(isPromise(str)).toBe(false);
  });

  it("should return true for a Promise resolved with a value", async () => {
    const promise = Promise.resolve("test");
    expect(isPromise(promise)).toBe(true);

    const result = await promise;
    expect(result).toBe("test");
  });

  it("should return true for a Promise rejected with a value", async () => {
    const promise = Promise.reject(new Error("test"));
    expect(isPromise(promise)).toBe(true);

    try {
      await promise;
    } catch (error) {
      expect((error as Error).message).toBe("test");
    }
  });
});
