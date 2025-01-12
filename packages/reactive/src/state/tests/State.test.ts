import { describe, expect, it } from "vitest";
import { State } from "..";

describe("State [runtime]", () => {
  it("should allow value to be accesed via .value", () => {
    const value = 10;
    const state = State(value);

    expect(state.value).toBe(value);
  });

  it("should allow value to be accesed via function call", () => {
    const value = "☝🤓";
    const state = State(value);

    expect(state()).toBe(value);
  });

  it("should allow updating the value using the setter", () => {
    const initial = true;
    const next = false;
    const state = State(initial);

    state.value = false;

    expect(state()).toBe(next);
  });

  it("should not allow redefinition of the value property", () => {
    const initial = 50;
    const next = 99;
    const state = State(initial);

    expect(() => {
      Object.defineProperty(state, "value", {
        get: () => 42,
        set: () => {},
      });
    }).toThrow(TypeError);

    // Ensure the value property still works as intended
    expect(state.value).toBe(initial);

    state.value = next;
    expect(state.value).toBe(next);
  });
});
