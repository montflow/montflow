import * as Vitest from "vitest";
import * as State from "../index.svelte.js";

Vitest.describe("State.make", it => {
  it("should allow to access value via function call", () => {
    const value = 10;
    const state = State.make(value);

    Vitest.expect(state()).toBe(value);
  });

  it("should allow to access value via .value property", () => {
    const value = 10;
    const state = State.make(value);

    Vitest.expect(state.value).toBe(value);
  });
});
