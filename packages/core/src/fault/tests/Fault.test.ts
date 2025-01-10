import { describe, expectTypeOf, it } from "vitest";
import { CodeOf, Fault, Of, ReasonOf } from "..";

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

  it("should extract code type from Fault", () => {
    type MyFault = Fault<"ERROR_CODE">;
    type CodeType = CodeOf<MyFault>;

    expectTypeOf<CodeType>().toMatchTypeOf<"ERROR_CODE">();
  });

  it("should extract reason type from Fault", () => {
    type MyFaultWithReason = Fault.WithReason<"ERROR_CODE", string>;
    type ReasonType = ReasonOf<MyFaultWithReason>;

    expectTypeOf<ReasonType>().toMatchTypeOf<string>();
  });

  it("should generate a union of provided faults", () => {
    type Faults = [Fault<"ERROR_CODE1">, Fault.WithReason<"ERROR_CODE2", string>];
    type UnionOfFaults = Of<Faults>;

    const fault1: UnionOfFaults = { code: "ERROR_CODE1" };
    const fault2: UnionOfFaults = {
      code: "ERROR_CODE2",
      reason: "Some reason",
    };

    expectTypeOf(fault1).toMatchTypeOf<UnionOfFaults>();
    expectTypeOf(fault2).toMatchTypeOf<UnionOfFaults>();
  });
});
