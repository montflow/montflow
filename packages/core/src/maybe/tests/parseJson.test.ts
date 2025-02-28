import { describe, expect, it } from "vitest";
import * as Maybe from "../index.js";

describe("Maybe.parseJson [runtime]", () => {
  it("should return Some when input is Some with valid JSON", () => {
    const inner = '{"name":"Alice","age":30}';
    const some = Maybe.some(inner);
    const value = Maybe.parseJson()(some);

    expect(Maybe.isSome(value)).toBe(true);
    if (Maybe.isSome(value)) expect(value.value).toEqual({ name: "Alice", age: 30 });
  });

  it("should return None when input is Some with invalid JSON", () => {
    const inner = '{"name":"Alice", age:30}';
    const some = Maybe.some(inner);
    const value = Maybe.parseJson()(some);

    expect(Maybe.isNone(value)).toBe(true);
  });

  it("should return None when input is None", () => {
    const none = Maybe.none();
    const value = Maybe.parseJson()(none);

    expect(Maybe.isNone(value)).toBe(true);
  });
});
