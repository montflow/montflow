import { internal as _ } from "./internal";
import { Loop, Priority, StepCallback } from "./loop";

export interface Loopable extends Disposable {
  readonly id: number;
  readonly priority: Priority;
  readonly callback: StepCallback;

  running: boolean;
  loop?: Loop;

  stop(): void;
  start(): void;
}

export namespace Loopable {
  export type Options = { priority?: Priority };
}

export const Loopable = (callback: StepCallback, opts?: Loopable.Options): Loopable => {
  const { priority } = { priority: 0, ...opts } satisfies Required<Loopable.Options>;

  const id: Loopable["id"] = _.next++;
  let running: Loopable["running"] = false;
  let loop: Loopable["loop"] = undefined;

  const stop: Loopable["stop"] = () => {
    if (!loop || !running) return;
    loop.remove(self);
  };

  const start: Loopable["start"] = () => {
    if (!loop || running) return;
    loop.register(self);
  };

  const self: Loopable = {
    id,
    callback,
    priority,

    get running() {
      return running;
    },

    set running(r) {
      if (!_.inContext) {
        console.warn("modifying loopable.running will cause to undefined behavior");
      }

      running = r;
    },

    get loop() {
      return loop;
    },

    set loop(l) {
      if (!_.inContext) {
        console.warn("modifying loopable.loop will cause to undefined behavior");
      }

      loop = l;
    },

    stop,
    start,

    [Symbol.dispose]: stop,
  };

  return self;
};
