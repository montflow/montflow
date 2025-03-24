import { Cause, Effect, Exit } from "effect";
import { describe, expect, expectTypeOf } from "vitest";
import * as Fault from "../index.js";

describe("Fault.fail [runtime]", it => {
  const getExitError = <E>(exit: Exit.Exit<any, E>): E => {
    if (!Exit.isFailure(exit)) throw new Error("not a failure");
    if (!Cause.isFailType(exit.cause)) throw new Error("not a fail type cause");

    return exit.cause.error;
  };

  it("should be able to create base fault effect from tag", () => {
    const program = Fault.fail("CustomFault");

    expect(Effect.isEffect(program)).toBe(true);

    const exit = program.pipe(Effect.runSyncExit);
    const fault = getExitError(exit);

    expect(Fault.isBaseFault(fault));
    expect(fault._tag).toBe("CustomFault");
  });

  it("should be able to create extended fault effect from tag and context", () => {
    const program = Fault.fail("CustomFault", { issues: ["A", "B"] });

    expect(Effect.isEffect(program)).toBe(true);

    const exit = program.pipe(Effect.runSyncExit);
    const fault = getExitError(exit);

    expect(Fault.isExtendedFault(fault)).toBe(true);
    expect(fault._tag).toBe("CustomFault");
    expect(fault).toHaveProperty("issues");
    expect(fault.issues).toEqual(["A", "B"]);
  });

  it("should be able to create base fault effect from constructor", () => {
    class CustomFault extends Fault.Base("CustomFault") {}
    const program = Fault.fail(CustomFault);

    expect(Effect.isEffect(program)).toBe(true);

    const exit = program.pipe(Effect.runSyncExit);
    const fault = getExitError(exit);

    expect(Fault.isBaseFault(fault)).toBe(true);
    expect(fault).toBeInstanceOf(CustomFault);
    expect(fault._tag).toBe("CustomFault");
  });
});

describe("Fault.fail [types]", it => {
  it("should correctly infer Effect with Fault.Base when provided with custom tag", () => {
    const result = Fault.fail("CustomFault");

    type Test = typeof result;
    type Expected = Effect.Effect<never, Fault.Base<"CustomFault">>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should correctly infer Effect with Fault.Extended when provided with custom tag and context", () => {
    const result = Fault.fail("CustomFault", { ctx: "(☞ﾟヮﾟ)☞" });

    type Test = typeof result;
    type Expected = Effect.Effect<never, Fault.Extended<"CustomFault", { ctx: string }>>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should correctly infer Effect with Fault.Base when provided Fault.Base constructor", () => {
    class CustomFault extends Fault.Base("CustomFault") {}

    const result = Fault.fail(CustomFault);

    type Test = typeof result;
    type Expected = Effect.Effect<never, CustomFault>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should correctly infer Effect with Fault.Extended when provided Fault.Extended constructor", () => {
    type Context = { hello: number };
    class CustomFault extends Fault.Extended("CustomFault")<Context> {}

    const result = Fault.fail(CustomFault, { hello: 42 });

    type Test = typeof result;
    type Expected = Effect.Effect<never, CustomFault>;

    expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  it("should error when given base fault with context", () => {
    class CustomFault extends Fault.Base("CustomFault") {}

    // @ts-expect-error
    const program = Fault.fail(CustomFault, {});
  });

  it("should error when given extended fault without context", () => {
    type Context = { hello: number };
    class CustomFault extends Fault.Extended("CustomFault")<Context> {}

    // @ts-expect-error
    const program = Fault.fail(CustomFault);
  });
});
