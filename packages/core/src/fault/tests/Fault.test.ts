import { describe, expectTypeOf, it } from "vitest";
import { Fault } from "..";

describe("Fault [types]", () => {
  it("should match type for Fault with code", () => {
    type MyFault = Fault<"ERROR_CODE">;
    const fault: MyFault = { code: "ERROR_CODE" };

    expectTypeOf(fault).toMatchTypeOf<Fault<"ERROR_CODE">>();
  });

  it("should match type for Fault with reason", () => {
    type MyFaultWithReason = Fault.WithReason<"ERROR_CODE", string>;
    const faultWithReason: MyFaultWithReason = {
      code: "ERROR_CODE",
      reason: "Some reason",
    };

    expectTypeOf(faultWithReason).toMatchTypeOf<Fault.WithReason<"ERROR_CODE", string>>();
  });

  it("should match type for Fault with string reason", () => {
    type MyStringFault = Fault.String<"ERROR_CODE">;
    const stringFault: MyStringFault = {
      code: "ERROR_CODE",
      reason: "Some string reason",
    };

    expectTypeOf(stringFault).toMatchTypeOf<Fault.String<"ERROR_CODE">>();
  });

  it("should match type for Fault with number reason", () => {
    type MyNumberFault = Fault.Number<"ERROR_CODE">;
    const numberFault: MyNumberFault = { code: "ERROR_CODE", reason: 123 };

    expectTypeOf(numberFault).toMatchTypeOf<Fault.Number<"ERROR_CODE">>();
  });

  it("should match type for Fault with boolean reason", () => {
    type MyBooleanFault = Fault.Boolean<"ERROR_CODE">;
    const booleanFault: MyBooleanFault = { code: "ERROR_CODE", reason: true };

    expectTypeOf(booleanFault).toMatchTypeOf<Fault.Boolean<"ERROR_CODE">>();
  });

  it("should match type for Fault with unknown reason", () => {
    type MyUnknownFault = Fault.Unknown<"ERROR_CODE">;
    const unknownFault: MyUnknownFault = { code: "ERROR_CODE", reason: {} };

    expectTypeOf(unknownFault).toMatchTypeOf<Fault.Unknown<"ERROR_CODE">>();
  });

  it("should match type for Fault with any type", () => {
    type MyAnyFault = Fault.Any;
    const anyFault: MyAnyFault = { code: "ERROR_CODE", reason: "Some reason" };

    expectTypeOf(anyFault).toMatchTypeOf<Fault.Any>();
  });

  it("should extract code type from Fault", () => {
    type MyFault = Fault<"ERROR_CODE">;
    type CodeType = Fault.CodeOf<MyFault>;

    expectTypeOf<CodeType>().toMatchTypeOf<"ERROR_CODE">();
  });

  it("should extract reason type from Fault", () => {
    type MyFaultWithReason = Fault.WithReason<"ERROR_CODE", string>;
    type ReasonType = Fault.ReasonOf<MyFaultWithReason>;

    expectTypeOf<ReasonType>().toMatchTypeOf<string>();
  });

  it("should generate a union of provided faults", () => {
    type Faults = [Fault<"ERROR_CODE1">, Fault.WithReason<"ERROR_CODE2", string>];
    type UnionOfFaults = Fault.Of<Faults>;

    const fault1: UnionOfFaults = { code: "ERROR_CODE1" };
    const fault2: UnionOfFaults = {
      code: "ERROR_CODE2",
      reason: "Some reason",
    };

    expectTypeOf(fault1).toMatchTypeOf<UnionOfFaults>();
    expectTypeOf(fault2).toMatchTypeOf<UnionOfFaults>();
  });
});
