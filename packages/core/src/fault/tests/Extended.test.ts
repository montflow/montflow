import { describe, expect } from "vitest";
import * as Fault from "../index.js";

describe("Fault.Extended [runtime]", it => {
  it("should be capable of being extended for custom error definition with context", () => {
    type Context = { num: string };
    class MyCustomFault extends Fault.Extended("MyCustomFault")<Context> {}

    const context: Context = { num: "hi" };
    const fault = new MyCustomFault(context);

    expect(fault).toHaveProperty("_id", Fault.Id);
    expect(fault).toHaveProperty("_tag", "MyCustomFault");
    expect(fault).toMatchObject(context);
    expect(fault).toHaveProperty("num", "hi");
  });
});

describe("Fault.Extended [types]", it => {
  it("should generate an opaque type that could be manually constructed", () => {
    type Context = { num: string };
    class MyCustomFault extends Fault.Extended("MyCustomFault")<Context> {}

    const _: MyCustomFault = { _id: "fault", _tag: "MyCustomFault", num: "something" };
  });

  it("should error when not declaring context", () => {
    // @ts-expect-error
    class MyCustomFault extends Fault.Extended("MyCustomFault") {}
  });

  it("should error when declaring empty context", () => {
    // @ts-expect-error
    class MyCustomFault extends Fault.Extended("MyCustomFault")<{}> {}
  });
});
