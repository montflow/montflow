import { delay } from "solzu";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { Loop } from "../loop";
import { Loopable } from "../loopable";

describe.concurrent("Loop", it => {
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

  it(`should only be running after first loopable is added`, () => {
    const loop = Loop();

    expect(loop.running).toBe(false);
    loop.register(Loopable(NOOP));
    expect(loop.running).toBe(true);
  });

  it(`should have its added loopable running after being added`, () => {
    const loop = Loop();

    const loopable = loop.register(Loopable(NOOP));
    expect(loopable.running).toBe(true);
  });

  it(`should stop running after loopable is removed`, () => {
    const loop = Loop();

    const loopable = loop.register(Loopable(NOOP));
    loopable.stop();

    expect(loop.running).toBe(false);
  });

  it(`should stop running after all loopables are removed`, () => {
    const loop = Loop();

    const loopableA = loop.register(Loopable(NOOP));
    const loopableB = loop.register(Loopable(NOOP));
    const loopableC = loop.register(Loopable(NOOP));

    loopableA.stop();
    loopableB.stop();
    loopableC.stop();

    expect(loop.running).toBe(false);
  });

  it(`should continue running after loopables remain`, () => {
    const loop = Loop();

    const loopableA = loop.register(Loopable(NOOP));
    const loopableB = loop.register(Loopable(NOOP));
    loop.register(Loopable(NOOP));

    loopableA.stop();
    loopableB.stop();

    expect(loop.running).toBe(true);
  });
  it(`should stop running after clear is called with 1 active loopable`, () => {
    const loop = Loop();

    expect(loop.running).toBe(false);

    loop.register(Loopable(NOOP));

    expect(loop.running).toBe(true);

    loop.clear();

    expect(loop.running).toBe(false);
  });

  it(`should cause loopable to stop running when clearing`, () => {
    const loop = Loop();

    expect(loop.running).toBe(false);

    const loopable = loop.register(Loopable(NOOP));

    expect(loop.running).toBe(true);

    loop.clear();

    expect(loop.running).toBe(false);
    expect(loopable.running).toBe(false);
  });

  it(`should stop running after clear is called with multiple active loopables`, () => {
    const loop = Loop();

    loop.register(Loopable(NOOP));
    loop.register(Loopable(NOOP));
    loop.register(Loopable(NOOP));

    loop.clear();

    expect(loop.running).toBe(false);
  });

  it(`should cause ALL loopables to stop running when clearing`, () => {
    const loop = Loop();

    const loopableA = loop.register(Loopable(NOOP));
    const loopableB = loop.register(Loopable(NOOP));
    const loopableC = loop.register(Loopable(NOOP));

    loop.clear();

    expect(loopableA.running).toBe(false);
    expect(loopableB.running).toBe(false);
    expect(loopableC.running).toBe(false);
  });

  it(`should run loopables in order based on their priority`, async () => {
    const loop = Loop();

    const stack: string[] = [];
    const order = ["first", "second", "thrid"];

    loop.register(Loopable(() => stack.push(order[2]), { priority: 3 }));
    loop.register(Loopable(() => stack.push(order[0]), { priority: 1 }));
    loop.register(Loopable(() => stack.push(order[1]), { priority: 2 }));

    await delay(256);

    loop.clear();

    for (let i = 0; i < stack.length; i++) {
      const element = stack[i];
      expect(element).toBe(order[i % order.length]);
    }
  });

  it(`should run loopables in order based on their priority even when added at different points`, async () => {
    const loop = Loop();

    const stack: string[] = [];
    const order = ["first", "second", "thrid"];

    loop.register(Loopable(() => stack.push(order[0]), { priority: 1 }));
    loop.register(Loopable(() => stack.push(order[1]), { priority: 2 }));
    loop.register(Loopable(() => stack.push(order[2]), { priority: 3 }));

    await delay(256);

    loop.clear();

    for (let i = 0; i < stack.length; i++) {
      const element = stack[i];
      expect(element).toBe(order[i % order.length]);
    }
  });

  it(`should stop after its single loopable calls .stop on self`, async () => {
    const loop = Loop();

    let count = 0;

    expect(loop.running).toBe(false);

    loop.add((_, self) => {
      count++;
      self.stop();
    });

    await delay(256);

    expect(count).toBe(1);
    expect(loop.running).toBe(false);
  });
});
