import { describe, expect } from "vitest";
import * as Fault from "../index.js";

describe("Fault.Base [runtime]", it => {
  it("should be capable of being extended for custom error definition", () => {
    class MyCustomFault extends Fault.Base("MyCustomFault") {}

    const fault = new MyCustomFault();

    expect(fault).toHaveProperty("_id", Fault.Id);
    expect(fault).toHaveProperty("_tag", "MyCustomFault");
  });
});

describe("Fault.Base [types]", it => {
  it("should generate an opaque type that could be manually constructed", () => {
    class MyCustomFault extends Fault.Base("MyCustomFault") {}

    const _: MyCustomFault = { _id: "fault", _tag: "MyCustomFault" };
  });
});
