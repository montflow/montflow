import { describe, expect } from "vitest";
import * as Fault from "../index.js";

describe("Fault.make [runtime]", it => {
  it("should be able to create simple/base faults inline with single provided argument", () => {
    const fault = Fault.make("CustomFault");

    expect(Fault.isFault(fault)).toBe(true);
    expect(Fault.isBaseFault(fault)).toBe(true);
  });

  it("should be able to create contexted/extended faults inline", () => {
    const fault = Fault.make("CustomFault", { issues: ["A", "B"] });

    expect(Fault.isFault(fault)).toBe(true);
    expect(Fault.isExtendedFault(fault)).toBe(true);
  });
});
