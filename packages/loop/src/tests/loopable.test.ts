import { delay } from "solzu";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { Loop } from "../loop";
import { Loopable } from "../loopable";

describe.concurrent("Loopable", it => {
  const NOOP = () => {};

  beforeEach(() => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(cb => {
      setTimeout(() => cb(performance.now()), 16);
      return 0;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
  });

  it(`should not be running when instanciated in isolation`, async () => {
    const loopable = Loopable(NOOP);
    expect(loopable.running).toBe(false);
    expect(loopable.loop).toBe(undefined);
  });

  it(`should stop after calling .stop on self`, async () => {
    const loop = Loop();
    const loopable = Loopable((_, self) => self.stop());

    expect(loopable.running).toBe(false);

    loop.register(loopable);

    await delay(256);

    expect(loopable.running).toBe(false);
  });

  it(`should resume after calling .stop and then .start`, async () => {
    const loop = Loop();
    const loopable = Loopable((_, self) => self.stop());

    expect(loopable.running).toBe(false);

    loop.register(loopable);

    await delay(256);

    expect(loopable.running).toBe(false);

    loopable.start();

    expect(loopable.running).toBe(true);

    await delay(256);

    expect(loopable.running).toBe(false);
  });
});
