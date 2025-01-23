import { describe, expect, it } from "vitest";
import { Range, unsafeClamp } from "..";

describe("unsafeClamp [runtime]", () => {
  it("should clamp value below tuple range", () => {
    const range: Range = [10, 20];
    const result = unsafeClamp(5, range);
    expect(result).toBe(10);
  });

  it("should clamp value within tuple range", () => {
    const range: Range = [10, 20];
    const result = unsafeClamp(15, range);
    expect(result).toBe(15);
  });

  it("should clamp value above tuple range", () => {
    const range: Range = [10, 20];
    const result = unsafeClamp(25, range);
    expect(result).toBe(20);
  });

  it("should clamp value below object range", () => {
    const range: Range = { min: -5, max: 5 };
    const result = unsafeClamp(-10, range);
    expect(result).toBe(-5);
  });

  it("should clamp value within object range", () => {
    const range: Range = { min: -5, max: 5 };
    const result = unsafeClamp(0, range);
    expect(result).toBe(0);
  });

  it("should clamp value above object range", () => {
    const range: Range = { min: -5, max: 5 };
    const result = unsafeClamp(10, range);
    expect(result).toBe(5);
  });

  it("should throw error for invalid tuple range", () => {
    const invalidRange: Range = [20, 10];
    expect(() => unsafeClamp(15, invalidRange)).toThrow(Error);
  });

  it("should throw error for invalid object range", () => {
    const invalidRange: Range = { min: 10, max: 5 };
    expect(() => unsafeClamp(7, invalidRange)).toThrow(Error);
  });

  it("should clamp value below range with same min and max", () => {
    const range: Range = { min: 5, max: 5 };
    const result = unsafeClamp(3, range);
    expect(result).toBe(5);
  });

  it("should clamp value equal to range with same min and max", () => {
    const range: Range = { min: 5, max: 5 };
    const result = unsafeClamp(5, range);
    expect(result).toBe(5);
  });

  it("should clamp value above range with same min and max", () => {
    const range: Range = { min: 5, max: 5 };
    const result = unsafeClamp(7, range);
    expect(result).toBe(5);
  });

  it("should clamp value below negative range", () => {
    const range: Range = [-10, -5];
    const result = unsafeClamp(-15, range);
    expect(result).toBe(-10);
  });

  it("should clamp value within negative range", () => {
    const range: Range = [-10, -5];
    const result = unsafeClamp(-7, range);
    expect(result).toBe(-7);
  });

  it("should clamp value above negative range", () => {
    const range: Range = [-10, -5];
    const result = unsafeClamp(0, range);
    expect(result).toBe(-5);
  });

  it("should work with curried version for value below range", () => {
    const range: Range = [10, 20];
    const clamped = unsafeClamp(range);
    const result = clamped(5);
    expect(result).toBe(10);
  });

  it("should work with curried version for value within range", () => {
    const range: Range = [10, 20];
    const clamped = unsafeClamp(range);
    const result = clamped(15);
    expect(result).toBe(15);
  });

  it("should work with curried version for value above range", () => {
    const range: Range = [10, 20];
    const clamped = unsafeClamp(range);
    const result = clamped(25);
    expect(result).toBe(20);
  });
});
