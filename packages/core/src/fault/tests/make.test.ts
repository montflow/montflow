import { describe, expect, expectTypeOf } from "vitest";
import * as Fault from "../index.js";

describe("Fault.make [runtime]", it => {
  it("should be able to create base fault from tag", () => {
    const fault = Fault.make("CustomFault");

    expect(Fault.isFault(fault)).toBe(true);
    expect(Fault.isBaseFault(fault)).toBe(true);
  });

  it("should be able to create extended fault from tag and context", () => {
    const fault = Fault.make("CustomFault", { issues: ["A", "B"] });

    expect(Fault.isFault(fault)).toBe(true);
    expect(Fault.isExtendedFault(fault)).toBe(true);
  });

  it("should be able to create base fault from constructor", () => {
    class CustomFault extends Fault.Base("CustomFault") {}
    const fault = Fault.make(CustomFault);

    expect(Fault.isFault(fault)).toBe(true);
    expect(Fault.isBaseFault(fault)).toBe(true);
    expect(fault).toBeInstanceOf(CustomFault);
  });

  it("should be able to create extended fault from constructor", () => {
    const context = { song: "l9" };
    class CustomFault extends Fault.Extended("CustomFault")<typeof context> {}
    const fault = Fault.make(CustomFault, context);

    expect(Fault.isFault(fault)).toBe(true);
    expect(Fault.isExtendedFault(fault)).toBe(true);
    expect(fault).toBeInstanceOf(CustomFault);
  });
});

describe("Fault.make [types]", it => {
  it("should correctly infer Fault.Base type when provided with custom tag", () => {
    const result = Fault.make("CustomFault");

    type Test = typeof result;
    type Expected = Fault.Base<"CustomFault">;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should correctly infer Fault.Extended type when provided with custom tag and context", () => {
    const result = Fault.make("CustomFault", { ctx: "༼ つ ◕_◕ ༽つ" });

    type Test = typeof result;
    type Expected = Fault.Extended<"CustomFault", { ctx: string }>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should correctly infer Fault.Base type when provided Fault.Base constructor", () => {
    class CustomFault extends Fault.Base("CustomFault") {}

    const result = Fault.make(CustomFault);

    type Test = typeof result;
    type Expected = CustomFault;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should correctly infer Fault.Extended type when provided Fault.Extended constructor", () => {
    type Context = { hello: number };
    class CustomFault extends Fault.Extended("CustomFault")<Context> {}

    const result = Fault.make(CustomFault, { hello: 42 });

    type Test = typeof result;
    type Expected = CustomFault;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should error when given base fault with context", () => {
    class CustomFault extends Fault.Base("CustomFault") {}

    // @ts-expect-error
    const fault = Fault.make(CustomFault, {});
  });

  it("should error when given extended fault without context", () => {
    type Context = { hello: number };
    class CustomFault extends Fault.Extended("CustomFault")<Context> {}

    // @ts-expect-error
    const fault = Fault.make(CustomFault);
  });
});
