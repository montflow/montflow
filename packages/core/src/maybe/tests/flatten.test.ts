import { describe, expect, it } from "vitest";
import { None, Some, flatten, isNone, isSome } from "..";

describe("flatten [runtime]", () => {
  it("should return the original Some when provided with unnested Some", () => {
    const inner = 0xfafa;
    const some = Some(inner);

    const value = flatten()(some);

    expect(isSome(value)).toBe(true);
    expect(value).toHaveProperty("value", inner);
  });

  it("should return flattened Maybe when nested (depth 1)", () => {
    const inner = 0xfafa;

    const m1 = Some(inner);
    const m2 = Some(m1);

    const value = flatten()(m2);

    expect(isSome(value)).toBe(true);
    expect(value).toHaveProperty("value", inner);
  });

  it("should return flattened Result when nested (depth > 1)", () => {
    const inner = 0xfafa;

    const m1 = Some(inner); // Maybe<Inner>
    const m2 = Some(m1); // Maybe<Maybe<Inner>>
    const m3 = Some(m2); // Maybe<Maybe<Maybe<Inner>>>

    const value = flatten()(m3); // m2 => Maybe<Maybe<Inner>>

    expect(isSome(value)).toBe(true);
    expect(value).toStrictEqual(m2);
    expect(value).toHaveProperty("value", m1);
    expect((value as Some<any>).value).toHaveProperty("value", m1.value);
  });

  it("should return the original Err when provided with Err", () => {
    const none = None();

    const value = flatten()(none);

    expect(isNone(value)).toBe(true);
  });
});
