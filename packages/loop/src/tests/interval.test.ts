import { delay } from "solzu";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { Interval } from "../interval";
import { Loop } from "../loop";

describe.concurrent("Interval", it => {
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
    const interval = Interval({ duration: 1 });
    expect(interval.running).toBe(false);
    expect(interval.loop).toBe(undefined);
  });

  it(`should stop after calling .stop on self in onIteration`, async () => {
    const loop = Loop();
    const interval = Interval({ duration: 128, onIteration: self => self.stop() });

    expect(interval.running).toBe(false);

    loop.register(interval);

    await delay(256);

    expect(interval.running).toBe(false);
  });

  it(`should resume after calling .stop and then .start`, async () => {
    const loop = Loop();
    const interval = Interval({ duration: 128, onIteration: self => self.stop() });

    expect(interval.running).toBe(false);

    loop.register(interval);

    await delay(256);

    expect(interval.running).toBe(false);

    interval.start();

    expect(interval.running).toBe(true);

    await delay(256);

    expect(interval.running).toBe(false);
  });

  it("should trigger onComplete after maxIterations", async () => {
    const loop = Loop();

    let completed = false;

    loop.register(
      Interval({
        duration: 100,
        maxIterations: 3,
        onComplete: () => {
          completed = true;
        },
      })
    );

    await delay(512);

    expect(completed).toBe(true);
  });

  it("should trigger onIteration for each iteration", async () => {
    const loop = Loop();

    const iterationCounts: number[] = [];

    loop.register(
      Interval({
        duration: 100,
        maxIterations: 3,
        onIteration: self => {
          iterationCounts.push(self.iterations);
        },
      })
    );

    await delay(512);

    expect(iterationCounts).toEqual([1, 2, 3]);
  });

  it("should run the full maxIterations", async () => {
    const loop = Loop();

    const iterations: number[] = [];

    loop.register(
      Interval({
        duration: 100,
        maxIterations: 3,
        onIteration: self => iterations.push(self.iterations),
      })
    );

    await delay(512);

    expect(iterations).toEqual([1, 2, 3]);
  });

  it("should reset elapsed time after each iteration", async () => {
    const loop = Loop();

    const elapsedValues: number[] = [];

    loop.register(
      Interval({
        duration: 100,
        maxIterations: 3,
        onIteration: self => {
          elapsedValues.push(self.elapsed);
        },
      })
    );

    await delay(512);

    elapsedValues.forEach(elapsed => expect(elapsed).toBeLessThan(100 / 1000));
  });

  it("should support infinite iterations if maxIterations is 'infinite'", async () => {
    const loop = Loop();

    const iterationCounts: number[] = [];

    const interval = loop.register(
      Interval({
        duration: 50,
        maxIterations: "infinite",
        onIteration: self => {
          iterationCounts.push(self.iterations);
          if (self.iterations === 10) {
            self.stop();
          }
        },
      })
    );

    await delay(1024);

    expect(iterationCounts.length).toBe(10);
    expect(interval.running).toBe(false);
  });

  it("should not trigger onIteration after stopping", async () => {
    const loop = Loop();

    let count = 0;

    const interval = loop.register(
      Interval({
        duration: 50,
        maxIterations: "infinite",
        onIteration: self => {
          count++;
          if (count === 3) {
            self.stop();
          }
        },
      })
    );

    await delay(512);

    expect(count).toBe(3);
    expect(interval.running).toBe(false);
  });
});
