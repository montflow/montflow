import { describe, expect, expectTypeOf, it, vitest } from "vitest";
import * as Watcher from "..";
import * as State from "../../state";
import { Optional } from "../../types";

describe("Watcher.Poly [runtime]", () => {
  it("should trigger callback with initial states when 'immediate' option is true", () => {
    const state1 = State.make(10);
    const state2 = State.make("test");
    const callback = vitest.fn();

    Watcher.Poly([state1, state2], callback, { immediate: true });

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith([
      { previous: undefined, value: 10 },
      { previous: undefined, value: "test" },
    ]);
  });

  it("should not trigger callback initially when 'immediate' option is false", () => {
    const state1 = State.make(20);
    const state2 = State.make(false);
    const callback = vitest.fn();

    Watcher.Poly([state1, state2], callback, { immediate: false });

    expect(callback).not.toHaveBeenCalled();
  });

  it("should trigger callback with updated states when any state changes", () => {
    const state1 = State.make(30);
    const state2 = State.make("value");
    const callback = vitest.fn();

    Watcher.Poly([state1, state2], callback, { immediate: false });

    state1.value = 40;
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith([
      { previous: 30, value: 40 },
      { previous: undefined, value: "value" },
    ]);

    state2.value = "updated";
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith([
      { previous: 30, value: 40 },
      { previous: "value", value: "updated" },
    ]);
  });

  it("should stop triggering callback after dispose is called", () => {
    const state1 = State.make(50);
    const state2 = State.make("disposed");
    const callback = vitest.fn();

    const watcher = Watcher.Poly([state1, state2], callback, { immediate: false });
    watcher.dispose();

    state1.value = 60;
    state2.value = "changed";

    expect(callback).not.toHaveBeenCalled();
  });
});

describe("Watcher.Poly [types]", () => {
  it("should correctly type the callback parameters with known state types", () => {
    const state1 = State.make(100);
    const state2 = State.make("type");

    Watcher.Poly([state1, state2], ([state1Result, state2Result]) => {
      type TestState1Result = typeof state1Result;
      type ExpectedState1Result = { previous: Optional<number>; value: number };
      expectTypeOf<TestState1Result>().toMatchTypeOf<ExpectedState1Result>();

      type TestState2Result = typeof state2Result;
      type ExpectedState2Result = { previous: Optional<string>; value: string };
      expectTypeOf<TestState2Result>().toMatchTypeOf<ExpectedState2Result>();
    });
  });

  it("should correctly type the callback parameters with unknown state types", () => {
    const state1 = State.make<unknown>(200);
    const state2 = State.make<unknown>("unknown");

    Watcher.Poly([state1, state2], ([state1Result, state2Result]) => {
      type TestState1Result = typeof state1Result;
      type ExpectedState1Result = { previous: Optional<unknown>; value: unknown };
      expectTypeOf<TestState1Result>().toMatchTypeOf<ExpectedState1Result>();

      type TestState2Result = typeof state2Result;
      type ExpectedState2Result = { previous: Optional<unknown>; value: unknown };
      expectTypeOf<TestState2Result>().toMatchTypeOf<ExpectedState2Result>();
    });
  });

  it("should correctly type the callback parameters with complex state types", () => {
    const state1 = State.make<{ foo: string; bar: number }>({ foo: "hello", bar: 123 });
    const state2 = State.make<{ baz: boolean }>({ baz: true });

    Watcher.Poly([state1, state2], ([state1Result, state2Result]) => {
      type TestState1Result = typeof state1Result;
      type ExpectedState1Result = {
        previous: Optional<{ foo: string; bar: number }>;
        value: { foo: string; bar: number };
      };
      expectTypeOf<TestState1Result>().toMatchTypeOf<ExpectedState1Result>();

      type TestState2Result = typeof state2Result;
      type ExpectedState2Result = {
        previous: Optional<{ baz: boolean }>;
        value: { baz: boolean };
      };
      expectTypeOf<TestState2Result>().toMatchTypeOf<ExpectedState2Result>();
    });
  });
});
