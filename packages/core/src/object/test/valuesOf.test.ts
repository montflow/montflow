import { describe, expect, it } from "vitest";
import { valuesOf } from "..";

describe("valuesOf [runtime]", () => {
  it("should extract values in data-first overload", () => {
    const obj = { prop1: "🎈", prop2: 0x0, prop3: true };

    const result = valuesOf(obj);

    expect(result).toStrictEqual(["🎈", 0x0, true]);
  });
  it("should extract values in data-last overload", () => {
    const obj = { prop1: "🎈", prop2: 0x0, prop3: true };

    const result = valuesOf()(obj);

    expect(result).toStrictEqual(["🎈", 0x0, true]);
  });
});
