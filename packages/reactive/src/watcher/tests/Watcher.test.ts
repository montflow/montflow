import { describe, expect, expectTypeOf, it, vitest } from "vitest";
import { State, Watcher } from "../..";
import { Optional } from "../../types";

describe("Watcher [runtime]", () => {
  it("should trigger callback with initial state when 'immediate' option is true", () => {
    const value = 0x0;

    const state = State.make(value);
    const callback = vitest.fn();

    Watcher.make(state, callback, { immediate: true });

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith({ previous: undefined, value: value });
  });

  it("should not trigger callback initially when 'immediate' option is false", () => {
    const value = "test";

    const state = State.make(value);
    const callback = vitest.fn();

    Watcher.make(state, callback, { immediate: false });

    expect(callback).not.toHaveBeenCalled();
  });

  it("should trigger callback with updated state on state change", () => {
    const first = 10;
    const next = 5;

    const state = State.make(first);
    const callback = vitest.fn();

    Watcher.make(state, callback, { immediate: false });
    state.value = next;

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith({ previous: first, value: next });
  });

  it("should stop triggering callback after dispose is called", () => {
    const state = State.make(10);
    const callback = vitest.fn();

    const watcher = Watcher.make(state, callback, { immediate: false });
    watcher.dispose();
    state.value = 20;

    expect(callback).not.toHaveBeenCalled();
  });

  it("should trigger callback with initial states when 'immediate' option is true for multiple sources", () => {
    const value1 = 0x0;
    const value2 = "test";

    const state1 = State.make(value1);
    const state2 = State.make(value2);
    const callback = vitest.fn();

    Watcher.make([state1, state2], callback, { immediate: true });

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith([
      { previous: undefined, value: value1 },
      { previous: undefined, value: value2 },
    ]);
  });

  it("should trigger callback with updated states on state change for multiple sources", () => {
    const first1 = 10;
    const next1 = 5;
    const first2 = "foo";
    const next2 = "bar";

    const state1 = State.make(first1);
    const state2 = State.make(first2);
    const callback = vitest.fn();

    Watcher.make([state1, state2], callback, { immediate: false });
    state1.value = next1;
    state2.value = next2;

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith([
      { previous: first1, value: next1 },
      { previous: first2, value: next2 },
    ]);
  });

  it("should stop triggering callback after dispose is called for multiple sources", () => {
    const state1 = State.make(10);
    const state2 = State.make("test");
    const callback = vitest.fn();

    const watcher = Watcher.make([state1, state2], callback, { immediate: false });
    watcher.dispose();
    state1.value = 20;
    state2.value = "changed";

    expect(callback).not.toHaveBeenCalled();
  });
});

describe("Watcher [types]", () => {
  it("should correctly type the callback parameters with known state type", () => {
    const state = State.make(10);

    Watcher.make(state, ({ previous, value }) => {
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

    Watcher.make(state, ({ previous, value }) => {
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

    Watcher.make(state, ({ previous, value }) => {
      type TestPrevious = typeof previous;
      type ExpectedPrevious = Optional<{ foo: string; bar: number }>;
      expectTypeOf<TestPrevious>().toMatchTypeOf<ExpectedPrevious>();

      type TestValue = typeof value;
      type ExpectedValue = { foo: string; bar: number };
      expectTypeOf<TestValue>().toMatchTypeOf<ExpectedValue>();
    });
  });
});
