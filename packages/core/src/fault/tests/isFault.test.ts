import { describe, expect, expectTypeOf, it } from "vitest";
import * as Fault from "../index.js";

describe("Fault.isFault [runtime]", () => {
  it("should return true on base fault instance made via class API", () => {
    class MyCustomFault extends Fault.Base("MyCustomFault") {}
    const fault = new MyCustomFault();
    expect(Fault.isFault(fault)).toBe(true);
  });

  it("should return true on extended fault instance made via class API", () => {
    class MyCustomFault extends Fault.Extended("MyCustomFault")<{ idk: "🌊" }> {}
    const fault = new MyCustomFault({ idk: "🌊" });
    expect(Fault.isFault(fault)).toBe(true);
  });

  it("should return true on base fault instance made via make API", () => {
    const fault = Fault.make("MyCustomFault");
    expect(Fault.isFault(fault)).toBe(true);
  });

  it("should return true on extended fault instance made via make API", () => {
    const fault = Fault.make("MyCustomFault", { idk: "🌊" });
    expect(Fault.isFault(fault)).toBe(true);
  });

  it("should return false on non-fault objects", () => {
    const notFault = { _id: "not-fault", _tag: "NotAFault" };
    expect(Fault.isFault(notFault)).toBe(false);
  });
});

describe("Fault.isFault [types]", () => {
  it("should narrow type to Base<Tag> when isBaseFault is true", () => {
    const fault = Fault.make("MyCustomFault");
    if (Fault.isBaseFault(fault)) {
      expectTypeOf(fault).toEqualTypeOf<Fault.Base<"MyCustomFault">>();
    }
  });

  it("should narrow type to Extended<Tag, Table> when isExtendedFault is true", () => {
    const fault = Fault.make("MyCustomFault", { idk: "🌊" });
    if (Fault.isExtendedFault(fault)) {
      expectTypeOf(fault).toEqualTypeOf<Fault.Fault<"MyCustomFault", { idk: string }>>();
    }
  });

  it("should narrow type to Fault<Tag> when isFault is true", () => {
    const fault = Fault.make("MyCustomFault");
    if (Fault.isFault(fault)) {
      expectTypeOf(fault).toEqualTypeOf<Fault.Fault<"MyCustomFault">>();
    }
  });

  it("should not narrow type when isFault is false", () => {
    const notFault = { _id: "not-fault", _tag: "NotAFault" };
    if (!Fault.isFault(notFault)) {
      expectTypeOf(notFault).not.toMatchTypeOf<Fault.Any>();
    }
  });
});
