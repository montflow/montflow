import { describe, expect, it } from "vitest";
import { clamp } from "..";
import * as Number from "../../number";
import * as Result from "../../result";

describe("clamp [runtime]", () => {
  it("should return clamped value in unsafe mode for value below tuple range", () => {
    const range: Number.Range = [10, 20];
    const result = clamp(5, range);
    expect(result).toBe(10);
  });

  it("should return clamped value in unsafe mode for value within tuple range", () => {
    const range: Number.Range = [10, 20];
    const result = clamp(15, range);
    expect(result).toBe(15);
  });

  it("should return clamped value in unsafe mode for value above tuple range", () => {
    const range: Number.Range = [10, 20];
    const result = clamp(25, range);
    expect(result).toBe(20);
  });

  it("should return clamped value in unsafe mode for value below object range", () => {
    const range: Number.Range = { min: -5, max: 5 };
    const result = clamp(-10, range);
    expect(result).toBe(-5);
  });

  it("should return clamped value in unsafe mode for value within object range", () => {
    const range: Number.Range = { min: -5, max: 5 };
    const result = clamp(0, range);
    expect(result).toBe(0);
  });

  it("should return clamped value in unsafe mode for value above object range", () => {
    const range: Number.Range = { min: -5, max: 5 };
    const result = clamp(10, range);
    expect(result).toBe(5);
  });

  it("should throw error in unsafe mode for invalid tuple range", () => {
    const invalidRange: Number.Range = [20, 10];
    expect(() => clamp(15, invalidRange)).toThrow(Error);
  });

  it("should throw error in unsafe mode for invalid object range", () => {
    const invalidRange: Number.Range = { min: 10, max: 5 };
    expect(() => clamp(7, invalidRange)).toThrow(Error);
  });

  it("should return clamped value wrapped in Result.Ok in safe mode for value below tuple range", () => {
    const range: Number.Range = [10, 20];
    const result = clamp(5, range, { mode: "safe" });
    expect(result).toEqual(Result.Ok(10));
  });

  it("should return clamped value wrapped in Result.Ok in safe mode for value within tuple range", () => {
    const range: Number.Range = [10, 20];
    const result = clamp(15, range, { mode: "safe" });
    expect(result).toEqual(Result.Ok(15));
  });

  it("should return clamped value wrapped in Result.Ok in safe mode for value above tuple range", () => {
    const range: Number.Range = [10, 20];
    const result = clamp(25, range, { mode: "safe" });
    expect(result).toEqual(Result.Ok(20));
  });

  it("should return Result.Err in safe mode for invalid tuple range", () => {
    const invalidRange: Number.Range = [20, 10];
    const result = clamp(15, invalidRange, { mode: "safe" });
    expect(result).toEqual(Result.Err({ code: "invalid range" }));
  });

  it("should return Result.Err in safe mode for invalid object range", () => {
    const invalidRange: Number.Range = { min: 10, max: 5 };
    const result = clamp(7, invalidRange, { mode: "safe" });
    expect(result).toEqual(Result.Err({ code: "invalid range" }));
  });

  it("should work with curried version in unsafe mode for value below range", () => {
    const range: Number.Range = [10, 20];
    const clamped = clamp(range);
    const result = clamped(5);
    expect(result).toBe(10);
  });

  it("should work with curried version in safe mode for value above range", () => {
    const range: Number.Range = [10, 20];
    const clamped = clamp(range, { mode: "safe" });
    const result = clamped(25);
    expect(result).toEqual(Result.Ok(20));
  });

  it("should work with curried version in safe mode for invalid range", () => {
    const invalidRange: Number.Range = [20, 10];
    const clamped = clamp(invalidRange, { mode: "safe" });
    const result = clamped(15);
    expect(result).toEqual(Result.Err({ code: "invalid range" }));
  });
});
