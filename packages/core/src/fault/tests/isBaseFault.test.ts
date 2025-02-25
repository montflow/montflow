import { describe, expect, expectTypeOf, it } from "vitest";
import * as Fault from "../index.js";

describe("Fault.isBaseFault [runtime]", () => {
  it("should return true on base fault instance made via class API", () => {
    class MyCustomFault extends Fault.Base("MyCustomFault") {}
    const fault = new MyCustomFault();
    expect(Fault.isBaseFault(fault)).toBe(true);
  });

  it("should return false on extended fault instance made via class API", () => {
    class MyCustomFault extends Fault.Extended("MyCustomFault")<{ idk: "🌊" }> {}
    const fault = new MyCustomFault({ idk: "🌊" });
    expect(Fault.isBaseFault(fault)).toBe(false);
  });

  it("should return true on base fault instance made via make API", () => {
    const fault = Fault.make("MyCustomFault");
    expect(Fault.isBaseFault(fault)).toBe(true);
  });

  it("should return false on extended fault instance made via make API", () => {
    const fault = Fault.make("MyCustomFault", { idk: "🌊" });
    expect(Fault.isBaseFault(fault)).toBe(false);
  });

  it("should return false on non-fault objects", () => {
    const notFault = { _id: "not-fault", _tag: "NotAFault" };
    expect(Fault.isBaseFault(notFault)).toBe(false);
  });
});

describe("Fault.isBaseFault [types]", () => {
  it("should narrow type to Base<Tag> when isBaseFault is true", () => {
    const fault = Fault.make("MyCustomFault");
    if (Fault.isBaseFault(fault)) {
      expectTypeOf(fault).toEqualTypeOf<Fault.Base<"MyCustomFault">>();
    }
  });

  it("should not narrow type to Base<Tag> when isBaseFault is false", () => {
    const fault = Fault.make("MyCustomFault", { idk: "🌊" });
    if (!Fault.isBaseFault(fault)) {
      expectTypeOf(fault).not.toEqualTypeOf<Fault.Base<"MyCustomFault">>();
    }
  });

  it("should not narrow type when isBaseFault is false on non-fault objects", () => {
    const notFault = { _id: "not-fault", _tag: "NotAFault" };
    if (!Fault.isBaseFault(notFault)) {
      expectTypeOf(notFault).not.toMatchTypeOf<Fault.Base<any>>();
    }
  });
});
