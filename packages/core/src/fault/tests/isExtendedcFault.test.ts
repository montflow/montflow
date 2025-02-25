import { describe, expect, expectTypeOf, it } from "vitest";
import * as Fault from "../index.js";

describe("Fault.isExtendedFault [runtime]", () => {
  it("should return false on base fault instance made via class API", () => {
    class MyCustomFault extends Fault.Base("MyCustomFault") {}
    const fault = new MyCustomFault();
    expect(Fault.isExtendedFault(fault)).toBe(false);
  });

  it("should return true on extended fault instance made via class API", () => {
    class MyCustomFault extends Fault.Extended("MyCustomFault")<{ idk: "🌊" }> {}
    const fault = new MyCustomFault({ idk: "🌊" });
    expect(Fault.isExtendedFault(fault)).toBe(true);
  });

  it("should return false on base fault instance made via make API", () => {
    const fault = Fault.make("MyCustomFault");
    expect(Fault.isExtendedFault(fault)).toBe(false);
  });

  it("should return true on extended fault instance made via make API", () => {
    const fault = Fault.make("MyCustomFault", { idk: "🌊" });
    expect(Fault.isExtendedFault(fault)).toBe(true);
  });

  it("should return false on non-fault objects", () => {
    const notFault = { _id: "not-fault", _tag: "NotAFault" };
    expect(Fault.isExtendedFault(notFault)).toBe(false);
  });
});

describe("Fault.isExtendedFault [types]", () => {
  it("should narrow type to Extended<Tag, Table> when isExtendedFault is true", () => {
    const fault = Fault.make("MyCustomFault", { idk: "🌊" });
    if (Fault.isExtendedFault(fault)) {
      expectTypeOf(fault).toEqualTypeOf<Fault.Fault<"MyCustomFault", { idk: string }>>();
    }
  });

  it("should not narrow type to Extended<Tag, Table> when isExtendedFault is false", () => {
    const fault = Fault.make("MyCustomFault");
    if (!Fault.isExtendedFault(fault)) {
      expectTypeOf(fault).not.toEqualTypeOf<Fault.Extended<"MyCustomFault", any>>();
    }
  });

  it("should not narrow type when isExtendedFault is false on non-fault objects", () => {
    const notFault = { _id: "not-fault", _tag: "NotAFault" };
    if (!Fault.isExtendedFault(notFault)) {
      expectTypeOf(notFault).not.toEqualTypeOf<Fault.Extended<any, any>>();
    }
  });
});
