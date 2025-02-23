import { describe, expect, it } from "vitest";
import * as Result from "../index.js";

describe("or [runtime]", () => {
  it("should return alternative value when input is Err w/ callback", () => {
    const alt: boolean = true;
    const f = () => alt;
    const result = Result.of<typeof alt, string>("err", "my error");

    const value = Result.or(f)(result);

    expect(value).toBe(alt);
  });

  it("should return alternative value when input is Err w/ value", () => {
    const alt: boolean = true;
    const result = Result.of<typeof alt, string>("err", "my error");

    const value = Result.or(alt)(result);

    expect(value).toBe(alt);
  });

  it("should return inner Ok value when input is Ok", () => {
    const alt: string = "true";
    const inner: string = "false";
    const result = Result.of<typeof alt, string>("ok", inner);

    const value = Result.or(alt)(result);

    expect(value).toBe(inner);
  });

  it("should pass in error to callback when input is Err", () => {
    const alt: number = 0xf;
    const error: string = "custom error";

    const f = (e: string) => {
      expect(e).toBe(error);
      return alt;
    };

    const result = Result.of<typeof alt, typeof error>("err", error);

    const value = Result.or(f)(result);

    expect(value).toBe(alt);
  });
});
