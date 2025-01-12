import { describe, expect, it, vi } from "vitest";
import * as Computed from "..";
import * as State from "../../state";

describe("Computed.Poly [runtime]", () => {
  it("should compute initial value correctly", () => {
    const state = State.make(5);
    const callback = vi.fn(([{ value }]) => value * 2);
    const computed = Computed.Poly([state], callback);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenLastCalledWith([{ previous: undefined, value: 5 }]);
    expect(computed.value).toBe(10);
  });

  it("should compute value correctly with two states", () => {
    const state1 = State.make(3);
    const state2 = State.make(4);
    const callback = vi.fn(([{ value: value1 }, { value: value2 }]) => value1 + value2);
    const computed = Computed.Poly([state1, state2], callback);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenLastCalledWith([
      { previous: undefined, value: 3 },
      { previous: undefined, value: 4 },
    ]);
    expect(computed.value).toBe(7);
  });

  it("should compute value correctly with three states", () => {
    const state1 = State.make(2);
    const state2 = State.make(3);
    const state3 = State.make(4);
    const callback = vi.fn(
      ([{ value: value1 }, { value: value2 }, { value: value3 }]) => value1 * value2 * value3
    );
    const computed = Computed.Poly([state1, state2, state3], callback);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenLastCalledWith([
      { previous: undefined, value: 2 },
      { previous: undefined, value: 3 },
      { previous: undefined, value: 4 },
    ]);
    expect(computed.value).toBe(24);
  });

  it("should compute value correctly with nested computed", () => {
    const state1 = State.make(2);
    const state2 = State.make(3);
    const innerCallback = vi.fn(([{ value: value1 }, { value: value2 }]) => value1 + value2);
    const innerComputed = Computed.Poly([state1, state2], innerCallback);

    const state3 = State.make(4);
    const outerCallback = vi.fn(
      ([{ value: innerValue }, { value: value3 }]) => innerValue * value3
    );
    const outerComputed = Computed.Poly([innerComputed, state3], outerCallback);

    expect(innerCallback).toHaveBeenCalledTimes(1);
    expect(innerCallback).toHaveBeenLastCalledWith([
      { previous: undefined, value: 2 },
      { previous: undefined, value: 3 },
    ]);
    expect(innerComputed.value).toBe(5);

    expect(outerCallback).toHaveBeenCalledTimes(1);
    expect(outerCallback).toHaveBeenLastCalledWith([
      { previous: undefined, value: 5 },
      { previous: undefined, value: 4 },
    ]);
    expect(outerComputed.value).toBe(20);
  });
});
