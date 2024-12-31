import { describe, expect, it } from "vitest";
import { isNone, isSome, None, parseJson, Some } from "..";

describe("parseJson [runtime]", () => {
  it("should return Some when input is Some with valid JSON", () => {
    const inner = '{"name":"Alice","age":30}';
    const some = Some(inner);
    const value = parseJson()(some);

    expect(isSome(value)).toBe(true);
    if (isSome(value)) expect(value.value).toEqual({ name: "Alice", age: 30 });
  });

  it("should return None when input is Some with invalid JSON", () => {
    const inner = '{"name":"Alice", age:30}';
    const some = Some(inner);
    const value = parseJson()(some);

    expect(isNone(value)).toBe(true);
  });

  it("should return None when input is None", () => {
    const none = None();
    const value = parseJson()(none);

    expect(isNone(value)).toBe(true);
  });
});
