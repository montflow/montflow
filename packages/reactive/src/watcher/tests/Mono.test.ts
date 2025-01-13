import { Optional } from "@montflow/core";
import { describe, expect, expectTypeOf, it, vitest } from "vitest";
import { State, Watcher } from "../..";

describe("Watcher.Mono [runtime]", () => {
  it("should trigger callback with initial state when 'immediate' option is true", () => {
    const value = 0x0;

    const state = State.make(value);
    const callback = vitest.fn();

    Watcher.Mono(state, callback, { immediate: true });

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith({ previous: undefined, value: value });
  });

  it("should not trigger callback initially when 'immediate' option is false", () => {
    const value = "test";

    const state = State.make(value);
    const callback = vitest.fn();

    Watcher.Mono(state, callback, { immediate: false });

    expect(callback).not.toHaveBeenCalled();
  });

  it("should trigger callback with updated state on state change", () => {
    const first = 10;
    const next = 5;

    const state = State.make(first);
    const callback = vitest.fn();

    Watcher.Mono(state, callback, { immediate: false });
    state.value = next;

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith({ previous: first, value: next });
  });

  it("should stop triggering callback after dispose is called", () => {
    const state = State.make(10);
    const callback = vitest.fn();

    const watcher = Watcher.Mono(state, callback, { immediate: false });
    watcher.dispose();
    state.value = 20;

    expect(callback).not.toHaveBeenCalled();
  });
});

describe("Watcher.Mono [types]", () => {
  it("should correctly type the callback parameters with known state type", () => {
    const state = State.make(10);

    Watcher.Mono(state, ({ previous, value }) => {
      type TestPrevious = typeof previous;
      type ExpectedPrevious = Optional<number>;
      expectTypeOf<TestPrevious>().toMatchTypeOf<ExpectedPrevious>();

      type TestValue = typeof value;
      type ExpectedValue = number;
      expectTypeOf<TestValue>().toMatchTypeOf<ExpectedValue>();
    });
  });

  it("should correctly type the callback parameters with unknown state type", () => {
    const state = State.make<unknown>(10);

    Watcher.Mono(state, ({ previous, value }) => {
      type TestPrevious = typeof previous;
      type ExpectedPrevious = Optional<unknown>;
      expectTypeOf<TestPrevious>().toMatchTypeOf<ExpectedPrevious>();

      type TestValue = typeof value;
      type ExpectedValue = unknown;
      expectTypeOf<TestValue>().toMatchTypeOf<ExpectedValue>();
    });
  });

  it("should correctly type the callback parameters with a complex state type", () => {
    const state = State.make<{ foo: string; bar: number }>({ foo: "test", bar: 42 });

    Watcher.Mono(state, ({ previous, value }) => {
      type TestPrevious = typeof previous;
      type ExpectedPrevious = Optional<{ foo: string; bar: number }>;
      expectTypeOf<TestPrevious>().toMatchTypeOf<ExpectedPrevious>();

      type TestValue = typeof value;
      type ExpectedValue = { foo: string; bar: number };
      expectTypeOf<TestValue>().toMatchTypeOf<ExpectedValue>();
    });
  });
});
