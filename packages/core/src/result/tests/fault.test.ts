import { describe, expect, expectTypeOf, it } from "vitest";
import * as Fault from "../../fault/index.js";
import * as Result from "../index.js";

describe("Result.fault [runtime]", () => {
  it("should correctly create a custom err of base fault from tag", () => {
    const tag = "CustomFault";

    const err = Result.fault(tag);

    expect(Result.isErr(err)).toBe(true);
    if (Result.isErr(err)) {
      const fault = Fault.make(tag);
      expect(err.error).toMatchObject(fault);
    }
  });

  it("should correctly create a custom err of extended fault from tag", () => {
    const tag = "CustomFault";
    const context = { number: 10 };

    const err = Result.fault(tag, context);

    expect(Result.isErr(err)).toBe(true);
    if (Result.isErr(err)) {
      const fault = Fault.make(tag, context);
      expect(err.error).toMatchObject(fault);
    }
  });

  it("should correctly create a custom err of base fault from constructor", () => {
    class CustomFault extends Fault.Base("CustomFault") {}

    const err = Result.fault(CustomFault);

    expect(Result.isErr(err)).toBe(true);
    if (Result.isErr(err)) {
      expect(err.error).toBeInstanceOf(CustomFault);
      expect(err.error).toMatchObject(new CustomFault());
    }
  });

  it("should correctly create a custom err of extended fault from constructor", () => {
    const context = { tzn: true };
    class CustomFault extends Fault.Extended("CustomFault")<typeof context> {}

    const err = Result.fault(CustomFault, context);

    expect(Result.isErr(err)).toBe(true);
    if (Result.isErr(err)) {
      expect(err.error).toBeInstanceOf(CustomFault);
      expect(err.error).toMatchObject(new CustomFault(context));
    }
  });
});

describe("Result.fault [types]", () => {
  it("should correctly infer Fault.Base type when provided with custom tag", () => {
    const result = Result.fault("CustomFault");

    type Test = typeof result;
    type Expected = Result.Err<Fault.Base<"CustomFault">>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should correctly infer Fault.Extended type when provided with custom tag and context", () => {
    const result = Result.fault("CustomFault", { ctx: "" });

    type Test = typeof result;
    type Expected = Result.Err<Fault.Extended<"CustomFault">>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should correctly infer Fault.Base type when provided Fault.Base constructor", () => {
    class CustomFault extends Fault.Base("CustomFault") {}

    const result = Result.fault(CustomFault);

    type Test = typeof result;
    type Expected = Result.Err<CustomFault>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should correctly infer Fault.Extended type when provided Fault.Extended constructor", () => {
    type Context = { hello: number };
    class CustomFault extends Fault.Extended("CustomFault")<Context> {}

    const result = Result.fault(CustomFault, { hello: 10 });

    type Test = typeof result;
    type Expected = Result.Err<CustomFault>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should error when given base fault with context", () => {
    class CustomFault extends Fault.Base("CustomFault") {}

    // @ts-expect-error
    const result = Result.fault(CustomFault, {});
  });

  it("should error when given extended fault without context", () => {
    type Context = { hello: number };
    class CustomFault extends Fault.Extended("CustomFault")<Context> {}

    // @ts-expect-error
    const result = Result.fault(CustomFault);
  });
});
