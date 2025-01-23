import { describe, expect, it } from "vitest";
import { Range, safeClamp } from "..";
import * as Result from "../../result";

describe("safeClamp [runtime]", () => {
  it("should return clamped value wrapped in Result.Ok for value below tuple range", () => {
    const range: Range = [10, 20];
    const result = safeClamp(5, range);
    expect(result).toEqual(Result.Ok(10));
  });

  it("should return clamped value wrapped in Result.Ok for value within tuple range", () => {
    const range: Range = [10, 20];
    const result = safeClamp(15, range);
    expect(result).toEqual(Result.Ok(15));
  });

  it("should return clamped value wrapped in Result.Ok for value above tuple range", () => {
    const range: Range = [10, 20];
    const result = safeClamp(25, range);
    expect(result).toEqual(Result.Ok(20));
  });

  it("should return clamped value wrapped in Result.Ok for value below object range", () => {
    const range: Range = { min: -5, max: 5 };
    const result = safeClamp(-10, range);
    expect(result).toEqual(Result.Ok(-5));
  });

  it("should return clamped value wrapped in Result.Ok for value within object range", () => {
    const range: Range = { min: -5, max: 5 };
    const result = safeClamp(0, range);
    expect(result).toEqual(Result.Ok(0));
  });

  it("should return clamped value wrapped in Result.Ok for value above object range", () => {
    const range: Range = { min: -5, max: 5 };
    const result = safeClamp(10, range);
    expect(result).toEqual(Result.Ok(5));
  });

  it("should return Result.Err for invalid tuple range", () => {
    const invalidRange: Range = [20, 10];
    const result = safeClamp(15, invalidRange);
    expect(result).toEqual(Result.Err({ code: "invalid range" }));
  });

  it("should return Result.Err for invalid object range", () => {
    const invalidRange: Range = { min: 10, max: 5 };
    const result = safeClamp(7, invalidRange);
    expect(result).toEqual(Result.Err({ code: "invalid range" }));
  });

  it("should return clamped value wrapped in Result.Ok for range with same min and max", () => {
    const range: Range = { min: 5, max: 5 };
    const result1 = safeClamp(3, range);
    const result2 = safeClamp(5, range);
    const result3 = safeClamp(7, range);

    expect(result1).toEqual(Result.Ok(5));
    expect(result2).toEqual(Result.Ok(5));
    expect(result3).toEqual(Result.Ok(5));
  });

  it("should return clamped value wrapped in Result.Ok for negative range", () => {
    const range: Range = [-10, -5];
    const result1 = safeClamp(-15, range);
    const result2 = safeClamp(-7, range);
    const result3 = safeClamp(0, range);

    expect(result1).toEqual(Result.Ok(-10));
    expect(result2).toEqual(Result.Ok(-7));
    expect(result3).toEqual(Result.Ok(-5));
  });

  it("should work with curried version for value below range", () => {
    const range: Range = [10, 20];
    const clamped = safeClamp(range);
    const result = clamped(5);
    expect(result).toEqual(Result.Ok(10));
  });

  it("should work with curried version for value within range", () => {
    const range: Range = [10, 20];
    const clamped = safeClamp(range);
    const result = clamped(15);
    expect(result).toEqual(Result.Ok(15));
  });

  it("should work with curried version for value above range", () => {
    const range: Range = [10, 20];
    const clamped = safeClamp(range);
    const result = clamped(25);
    expect(result).toEqual(Result.Ok(20));
  });

  it("should return Result.Err in curried version for invalid range", () => {
    const invalidRange: Range = [20, 10];
    const clamped = safeClamp(invalidRange);
    const result = clamped(15);
    expect(result).toEqual(Result.Err({ code: "invalid range" }));
  });
});
