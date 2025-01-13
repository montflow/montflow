import { Optional } from "@montflow/core";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import * as Computed from "..";
import * as State from "../../state";

describe("Computed.Mono [runtime]", () => {
  it("should compute initial value correctly", () => {
    const state = State.make(5);
    const callback = vi.fn(({ value }) => value * 2);
    const computed = Computed.Mono(state, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenLastCalledWith({ previous: undefined, value: 5 });
    expect(computed.value).toBe(10);
  });

  it("should compute new value correctly when state changes", () => {
    const state = State.make(3);
    const callback = vi.fn(({ value }) => value + 4);
    const computed = Computed.Mono(state, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenLastCalledWith({ previous: undefined, value: 3 });
    expect(computed.value).toBe(7);

    state.value = 6;

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith({ previous: 3, value: 6 });
    expect(computed.value).toBe(10);
  });

  it("should handle different In and Out types correctly", () => {
    const state = State.make(5);
    const callback = vi.fn(({ value }) => `value: ${value}`);
    const computed = Computed.Mono(state, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenLastCalledWith({ previous: undefined, value: 5 });
    expect(computed.value).toBe("value: 5");

    state.value = 6;

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith({ previous: 5, value: 6 });
    expect(computed.value).toBe("value: 6");
  });

  it("should compute correctly with dependent computed values", () => {
    const state = State.make(2);
    const firstCallback = vi.fn(({ value }) => value * 3);
    const firstComputed = Computed.Mono(state, firstCallback);

    const secondCallback = vi.fn(({ value }) => value + 1);
    const secondComputed = Computed.Mono(firstComputed, secondCallback);

    expect(firstCallback).toHaveBeenCalledTimes(1);
    expect(firstCallback).toHaveBeenLastCalledWith({ previous: undefined, value: 2 });
    expect(firstComputed.value).toBe(6);

    expect(secondCallback).toHaveBeenCalledTimes(1);
    expect(secondCallback).toHaveBeenLastCalledWith({ previous: undefined, value: 6 });
    expect(secondComputed.value).toBe(7);

    state.value = 4;

    expect(firstCallback).toHaveBeenCalledTimes(2);
    expect(firstCallback).toHaveBeenLastCalledWith({ previous: 2, value: 4 });
    expect(firstComputed.value).toBe(12);

    expect(secondCallback).toHaveBeenCalledTimes(2);
    expect(secondCallback).toHaveBeenLastCalledWith({ previous: 6, value: 12 });
    expect(secondComputed.value).toBe(13);
  });

  it("should always compute when value changes with 'always' strategy", () => {
    const state = State.make(5);
    const callback = vi.fn(({ value }) => value * 2);
    const computed = Computed.Mono(state, callback, {
      compute: { strategy: "always" },
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenLastCalledWith({ previous: undefined, value: 5 });
    expect(computed.value).toBe(10);

    state.value = 7;

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith({ previous: 5, value: 7 });
    expect(computed.value).toBe(14);
  });

  it("should always compute even with same value when using 'always' strategy", () => {
    const state = State.make(5);
    const callback = vi.fn(({ value }) => value * 2);
    const computed = Computed.Mono(state, callback, {
      compute: { strategy: "always" },
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(computed.value).toBe(10);

    state.value = 5;

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith({ previous: 5, value: 5 });
    expect(computed.value).toBe(10);
  });

  it("should compute for each update with consecutive identical values using 'always' strategy", () => {
    const state = State.make(5);
    const callback = vi.fn(({ value }) => value * 2);
    const computed = Computed.Mono(state, callback, {
      compute: { strategy: "always" },
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(computed.value).toBe(10);

    state.value = 5;
    expect(callback).toHaveBeenCalledTimes(2);
    expect(computed.value).toBe(10);

    state.value = 5;
    expect(callback).toHaveBeenCalledTimes(3);
    expect(computed.value).toBe(10);

    state.value = 5;
    expect(callback).toHaveBeenCalledTimes(4);
    expect(computed.value).toBe(10);
  });

  it("should compute only once with 'once' strategy", () => {
    const state = State.make(5);
    const callback = vi.fn(({ value }) => value * 2);
    const computed = Computed.Mono(state, callback, {
      compute: { strategy: "once" },
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenLastCalledWith({ previous: undefined, value: 5 });
    expect(computed.value).toBe(10);

    state.value = 7;

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith({ previous: 5, value: 7 });
    expect(computed.value).toBe(14);
  });

  it("should compute only once even if value changes multiple times with 'once' strategy", () => {
    const state = State.make(5);
    const callback = vi.fn(({ value }) => value * 2);
    const computed = Computed.Mono(state, callback, {
      compute: { strategy: "once" },
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenLastCalledWith({ previous: undefined, value: 5 });
    expect(computed.value).toBe(10);

    state.value = 7;
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith({ previous: 5, value: 7 });
    expect(computed.value).toBe(14);

    state.value = 10;
    expect(callback).toHaveBeenCalledTimes(2);
    expect(computed.value).toBe(14);
  });

  it("should prevent subsequent dependencies from triggering when 'once' strategy is fulfilled", () => {
    const state = State.make(2);
    const firstCallback = vi.fn(({ value }) => value * 3);
    const firstComputed = Computed.Mono(state, firstCallback, {
      compute: { strategy: "once" },
    });

    const secondCallback = vi.fn(({ value }) => value + 1);
    const secondComputed = Computed.Mono(firstComputed, secondCallback, {
      compute: { strategy: "always" },
    });

    expect(firstCallback).toHaveBeenCalledTimes(1);
    expect(firstCallback).toHaveBeenLastCalledWith({ previous: undefined, value: 2 });
    expect(firstComputed.value).toBe(6);

    expect(secondCallback).toHaveBeenCalledTimes(1);
    expect(secondCallback).toHaveBeenLastCalledWith({ previous: undefined, value: 6 });
    expect(secondComputed.value).toBe(7);

    state.value = 4;

    expect(firstCallback).toHaveBeenCalledTimes(2);
    expect(firstCallback).toHaveBeenLastCalledWith({ previous: 2, value: 4 });
    expect(firstComputed.value).toBe(12);

    expect(secondCallback).toHaveBeenCalledTimes(2);
    expect(secondCallback).toHaveBeenLastCalledWith({ previous: 6, value: 12 });
    expect(secondComputed.value).toBe(13);

    state.value = 6;

    expect(firstCallback).toHaveBeenCalledTimes(2);
    expect(secondCallback).toHaveBeenCalledTimes(2);
    expect(secondComputed.value).toBe(13);
  });

  it("should not compute when using 'never' strategy", () => {
    const state = State.make(5);
    const callback = vi.fn(({ value }) => value * 2);
    const computed = Computed.Mono(state, callback, {
      compute: { strategy: "never" },
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenLastCalledWith({ previous: undefined, value: 5 });
    expect(computed.value).toBe(10);

    state.value = 7;

    expect(callback).toHaveBeenCalledTimes(1);
    expect(computed.value).toBe(10);
  });

  it("should not compute even if value changes multiple times with 'never' strategy", () => {
    const state = State.make(5);
    const callback = vi.fn(({ value }) => value * 2);
    const computed = Computed.Mono(state, callback, {
      compute: { strategy: "never" },
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenLastCalledWith({ previous: undefined, value: 5 });
    expect(computed.value).toBe(10);

    state.value = 7;
    expect(callback).toHaveBeenCalledTimes(1);
    expect(computed.value).toBe(10);

    state.value = 10;
    expect(callback).toHaveBeenCalledTimes(1);
    expect(computed.value).toBe(10);
  });

  it("should not trigger dependent computed values when using 'never' strategy", () => {
    const state = State.make(2);
    const firstCallback = vi.fn(({ value }) => value * 3);
    const firstComputed = Computed.Mono(state, firstCallback, {
      compute: { strategy: "never" },
    });

    const secondCallback = vi.fn(({ value }) => value + 1);
    const secondComputed = Computed.Mono(firstComputed, secondCallback, {
      compute: { strategy: "always" },
    });

    expect(firstCallback).toHaveBeenCalledTimes(1);
    expect(firstCallback).toHaveBeenLastCalledWith({ previous: undefined, value: 2 });
    expect(firstComputed.value).toBe(6);

    expect(secondCallback).toHaveBeenCalledTimes(1);
    expect(secondCallback).toHaveBeenLastCalledWith({ previous: undefined, value: 6 });
    expect(secondComputed.value).toBe(7);

    state.value = 4;

    expect(firstCallback).toHaveBeenCalledTimes(1);
    expect(firstComputed.value).toBe(6);

    expect(secondCallback).toHaveBeenCalledTimes(1);
    expect(secondComputed.value).toBe(7);
  });

  it("should compute when value changes loosely with 'loose' strategy", () => {
    const state = State.make(5);
    const callback = vi.fn(({ value }) => value * 2);
    const computed = Computed.Mono(state, callback, {
      compute: { strategy: "loose" },
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenLastCalledWith({ previous: undefined, value: 5 });
    expect(computed.value).toBe(10);

    state.value = 5;

    expect(callback).toHaveBeenCalledTimes(1);
    expect(computed.value).toBe(10);

    state.value = 6;

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith({ previous: 5, value: 6 });
    expect(computed.value).toBe(12);
  });

  it("should compute when value changes loosely with different types using 'loose' strategy", () => {
    const state = State.make("5");
    const callback = vi.fn(({ value }) => parseInt(value) * 2);
    const computed = Computed.Mono(state, callback, {
      compute: { strategy: "loose" },
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenLastCalledWith({ previous: undefined, value: "5" });
    expect(computed.value).toBe(10);

    state.value = "5";

    expect(callback).toHaveBeenCalledTimes(1);
    expect(computed.value).toBe(10);

    state.value = "6";

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith({ previous: "5", value: "6" });
    expect(computed.value).toBe(12);
  });

  it("should compute when value changes loosely with nested computed values using 'loose' strategy", () => {
    const state = State.make(2);
    const firstCallback = vi.fn(({ value }) => value * 3);
    const firstComputed = Computed.Mono(state, firstCallback, {
      compute: { strategy: "loose" },
    });

    const secondCallback = vi.fn(({ value }) => value + 1);
    const secondComputed = Computed.Mono(firstComputed, secondCallback, {
      compute: { strategy: "loose" },
    });

    expect(firstCallback).toHaveBeenCalledTimes(1);
    expect(firstCallback).toHaveBeenLastCalledWith({ previous: undefined, value: 2 });
    expect(firstComputed.value).toBe(6);

    expect(secondCallback).toHaveBeenCalledTimes(1);
    expect(secondCallback).toHaveBeenLastCalledWith({ previous: undefined, value: 6 });
    expect(secondComputed.value).toBe(7);

    state.value = 2;

    expect(firstCallback).toHaveBeenCalledTimes(1);
    expect(secondCallback).toHaveBeenCalledTimes(1);

    state.value = 4;

    expect(firstCallback).toHaveBeenCalledTimes(2);
    expect(firstCallback).toHaveBeenLastCalledWith({ previous: 2, value: 4 });
    expect(firstComputed.value).toBe(12);

    expect(secondCallback).toHaveBeenCalledTimes(2);
    expect(secondCallback).toHaveBeenLastCalledWith({ previous: 6, value: 12 });
    expect(secondComputed.value).toBe(13);
  });

  it("should compute when value changes strictly with 'strict' strategy #1", () => {
    const state = State.make(5);
    const callback = vi.fn(({ value }) => value * 2);
    const computed = Computed.Mono(state, callback, {
      compute: { strategy: "strict" },
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenLastCalledWith({ previous: undefined, value: 5 });
    expect(computed.value).toBe(10);

    state.value = 5;

    expect(callback).toHaveBeenCalledTimes(1);
    expect(computed.value).toBe(10);

    state.value = 6;

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith({ previous: 5, value: 6 });
    expect(computed.value).toBe(12);
  });

  it("should compute when value changes strictly with 'strict' strategy #2", () => {
    const state = State.make<string | number>(5);
    const callback = vi.fn(({ value }) => Number(value) * 2);
    const computed = Computed.Mono(state, callback, {
      compute: { strategy: "strict" },
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenLastCalledWith({ previous: undefined, value: 5 });
    expect(computed.value).toBe(10);

    state.value = "5";

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith({ previous: 5, value: "5" });
    expect(computed.value).toBe(10);

    state.value = 6;

    expect(callback).toHaveBeenCalledTimes(3);
    // TODO: investigate this behavior... Why is is number 5 rather than string 5?
    expect(callback).toHaveBeenLastCalledWith({ previous: 5, value: 6 });
    expect(computed.value).toBe(12);
  });

  it("should compute when value changes strictly with nested computed values using 'strict' strategy", () => {
    const state = State.make(2);
    const firstCallback = vi.fn(({ value }) => value * 3);
    const firstComputed = Computed.Mono(state, firstCallback, {
      compute: { strategy: "strict" },
    });

    const secondCallback = vi.fn(({ value }) => value + 1);
    const secondComputed = Computed.Mono(firstComputed, secondCallback, {
      compute: { strategy: "strict" },
    });

    expect(firstCallback).toHaveBeenCalledTimes(1);
    expect(firstCallback).toHaveBeenLastCalledWith({ previous: undefined, value: 2 });
    expect(firstComputed.value).toBe(6);

    expect(secondCallback).toHaveBeenCalledTimes(1);
    expect(secondCallback).toHaveBeenLastCalledWith({ previous: undefined, value: 6 });
    expect(secondComputed.value).toBe(7);

    state.value = 2;

    expect(firstCallback).toHaveBeenCalledTimes(1);
    expect(secondCallback).toHaveBeenCalledTimes(1);

    state.value = 4;

    expect(firstCallback).toHaveBeenCalledTimes(2);
    expect(firstCallback).toHaveBeenLastCalledWith({ previous: 2, value: 4 });
    expect(firstComputed.value).toBe(12);

    expect(secondCallback).toHaveBeenCalledTimes(2);
    expect(secondCallback).toHaveBeenLastCalledWith({ previous: 6, value: 12 });
    expect(secondComputed.value).toBe(13);
  });

  it("should compute only a limited number of times with 'limit' strategy", () => {
    const state = State.make(5);
    const callback = vi.fn(({ value }) => value * 2);
    const computed = Computed.Mono(state, callback, {
      compute: { strategy: "limit", times: 2 },
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenLastCalledWith({ previous: undefined, value: 5 });
    expect(computed.value).toBe(10);

    state.value = 7;

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith({ previous: 5, value: 7 });
    expect(computed.value).toBe(14);

    state.value = 9;

    expect(callback).toHaveBeenCalledTimes(3);
    expect(callback).toHaveBeenLastCalledWith({ previous: 7, value: 9 });
    expect(computed.value).toBe(18);

    state.value = 11;

    expect(callback).toHaveBeenCalledTimes(3);
    expect(computed.value).toBe(18);
  });

  it("should compute only a limited number of times with 'limit' strategy and nested computed values", () => {
    const state = State.make(2);
    const firstCallback = vi.fn(({ value }) => value * 3);
    const firstComputed = Computed.Mono(state, firstCallback, {
      compute: { strategy: "limit", times: 1 },
    });

    const secondCallback = vi.fn(({ value }) => value + 1);
    const secondComputed = Computed.Mono(firstComputed, secondCallback, {
      compute: { strategy: "always" },
    });

    expect(firstCallback).toHaveBeenCalledTimes(1);
    expect(firstCallback).toHaveBeenLastCalledWith({ previous: undefined, value: 2 });
    expect(firstComputed.value).toBe(6);

    expect(secondCallback).toHaveBeenCalledTimes(1);
    expect(secondCallback).toHaveBeenLastCalledWith({ previous: undefined, value: 6 });
    expect(secondComputed.value).toBe(7);

    state.value = 4;

    expect(firstCallback).toHaveBeenCalledTimes(2);
    expect(firstCallback).toHaveBeenLastCalledWith({ previous: 2, value: 4 });
    expect(firstComputed.value).toBe(12);

    expect(secondCallback).toHaveBeenCalledTimes(2);
    expect(secondCallback).toHaveBeenLastCalledWith({ previous: 6, value: 12 });
    expect(secondComputed.value).toBe(13);

    state.value = 6;

    expect(firstCallback).toHaveBeenCalledTimes(2);
    expect(secondCallback).toHaveBeenCalledTimes(2);
    expect(secondComputed.value).toBe(13);

    state.value = 8;

    expect(firstCallback).toHaveBeenCalledTimes(2);
    expect(secondCallback).toHaveBeenCalledTimes(2);
    expect(secondComputed.value).toBe(13);
  });

  it("should compute conditionally based on filter function with 'conditional' strategy", () => {
    const state = State.make(5);
    const callback = vi.fn(({ value }) => value * 2);
    const filter = vi.fn((previous, next) => next > previous);
    const computed = Computed.Mono(state, callback, {
      compute: { strategy: "conditional", filter },
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenLastCalledWith({ previous: undefined, value: 5 });
    expect(computed.value).toBe(10);

    state.value = 4;

    expect(filter).toHaveBeenCalledTimes(1);
    expect(filter).toHaveBeenLastCalledWith(5, 4);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(computed.value).toBe(10);

    state.value = 6;

    expect(filter).toHaveBeenCalledTimes(2);
    expect(filter).toHaveBeenLastCalledWith(5, 6);
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith({ previous: 5, value: 6 });
    expect(computed.value).toBe(12);
  });

  it("should compute conditionally with nested computed values using 'conditional' strategy", () => {
    const state = State.make(2);
    const firstCallback = vi.fn(({ value }) => value * 3);
    const firstFilter = vi.fn((previous, next) => next > previous);
    const firstComputed = Computed.Mono(state, firstCallback, {
      compute: { strategy: "conditional", filter: firstFilter },
    });

    const secondCallback = vi.fn(({ value }) => value + 1);
    const secondFilter = vi.fn((_, next) => next % 2 === 0);
    const secondComputed = Computed.Mono(firstComputed, secondCallback, {
      compute: { strategy: "conditional", filter: secondFilter },
    });

    expect(firstCallback).toHaveBeenCalledTimes(1);
    expect(firstCallback).toHaveBeenLastCalledWith({ previous: undefined, value: 2 });
    expect(firstComputed.value).toBe(6);

    expect(secondCallback).toHaveBeenCalledTimes(1);
    expect(secondCallback).toHaveBeenLastCalledWith({ previous: undefined, value: 6 });
    expect(secondComputed.value).toBe(7);

    state.value = 4;

    expect(firstFilter).toHaveBeenCalledTimes(1);
    expect(firstFilter).toHaveBeenLastCalledWith(2, 4);
    expect(firstCallback).toHaveBeenCalledTimes(2);
    expect(firstCallback).toHaveBeenLastCalledWith({ previous: 2, value: 4 });
    expect(firstComputed.value).toBe(12);

    expect(secondFilter).toHaveBeenCalledTimes(1);
    expect(secondFilter).toHaveBeenLastCalledWith(6, 12);
    expect(secondCallback).toHaveBeenCalledTimes(2);
    expect(secondCallback).toHaveBeenLastCalledWith({ previous: 6, value: 12 });
    expect(secondComputed.value).toBe(13);

    state.value = 3;

    expect(firstFilter).toHaveBeenCalledTimes(2);
    expect(firstFilter).toHaveBeenLastCalledWith(4, 3);
    expect(firstCallback).toHaveBeenCalledTimes(2);
    expect(firstComputed.value).toBe(12);

    expect(secondFilter).toHaveBeenCalledTimes(1);
    expect(secondCallback).toHaveBeenCalledTimes(2);
    expect(secondComputed.value).toBe(13);
  });
});

describe("Computed.Mono [types]", () => {
  it("should correctly type the callback parameters with known state type", () => {
    const state = State.make(10);

    Computed.Mono(state, ({ previous, value }) => {
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

    Computed.Mono(state, ({ previous, value }) => {
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

    Computed.Mono(state, ({ previous, value }) => {
      type TestPrevious = typeof previous;
      type ExpectedPrevious = Optional<{ foo: string; bar: number }>;
      expectTypeOf<TestPrevious>().toMatchTypeOf<ExpectedPrevious>();

      type TestValue = typeof value;
      type ExpectedValue = { foo: string; bar: number };
      expectTypeOf<TestValue>().toMatchTypeOf<ExpectedValue>();
    });
  });
});
