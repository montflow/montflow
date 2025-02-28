import { describe, expect, it } from "vitest";
import * as Maybe from "../index.js";

describe("Maybe.flatten [runtime]", () => {
  it("should return the original Some when provided with unnested Some", () => {
    const inner = 0xfafa;
    const some = Maybe.some(inner);

    const value = Maybe.flatten()(some);

    expect(Maybe.isSome(value)).toBe(true);
    expect(value).toHaveProperty("value", inner);
  });

  it("should return flattened Maybe when nested (depth 1)", () => {
    const inner = 0xfafa;

    const m1 = Maybe.some(inner);
    const m2 = Maybe.some(m1);

    const value = Maybe.flatten()(m2);

    expect(Maybe.isSome(value)).toBe(true);
    expect(value).toHaveProperty("value", inner);
  });

  it("should return flattened Result when nested (depth > 1)", () => {
    const inner = 0xfafa;

    const m1 = Maybe.some(inner); // Maybe<Inner>
    const m2 = Maybe.some(m1); // Maybe<Maybe<Inner>>
    const m3 = Maybe.some(m2); // Maybe<Maybe<Maybe<Inner>>>

    const value = Maybe.flatten()(m3); // m2 => Maybe<Maybe<Inner>>

    expect(Maybe.isSome(value)).toBe(true);
    expect(value).toStrictEqual(m2);
    expect(value).toHaveProperty("value", m1);
    expect((value as Maybe.Some<any>).value).toHaveProperty("value", m1.value);
  });

  it("should return the original Err when provided with Err", () => {
    const none = Maybe.none();

    const value = Maybe.flatten()(none);

    expect(Maybe.isNone(value)).toBe(true);
  });
});
