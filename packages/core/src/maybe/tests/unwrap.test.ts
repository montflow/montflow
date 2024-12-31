import { describe, expect, it } from "vitest";
import { None, Some, unwrap } from "..";

describe("unwrap", () => {
  it("should extract inner value of some when provided with Some instance", () => {
    const inner = 10;
    const some = Some(inner);

    const value = unwrap()(some);

    expect(value).toBe(inner);
  });

  it("should throw TakeError when provided with None instance", () => {
    const none = None();
    const callback = () => unwrap()(none);

    expect(callback).toThrow(Error);
  });
});
