import { state as _ } from "./internal";
import { Loop } from "./loop";
import type { Ticker } from "./types";

/**
 * Represents an object that can be added to a `loop`
 * @extends {Disposable}
 * @see {@link Loop}
 */
export interface Loopable extends Disposable {
  readonly id: number;
  readonly priority: number;
  readonly ticker: Ticker;

  /**
   * Indicates if the loop is currently running (ticking).
   * @readonly
   */
  running: boolean;

  /**
   * Reference to registered `loop`
   * @readonly
   * @see {@link Loop}
   */
  loop?: Loop;

  /**
   * Attempts to stop this loopable.
   * Does nothing if there's no associated loop or if it's not currently running.
   */
  stop(): void;

  /**
   * Attempts to start this loopable.
   * Does nothing if there's no associated loop or if it's already running.
   */
  start(): void;
}

export namespace Loopable {
  export type Options = { priority?: number };
}

/**
 * @param {Ticker} ticker - Function to be called on each tick of the loop
 * @param {Loopable.Options} opts - Optional configuration settings
 *
 * @returns A new Loopable instance
 */
export const Loopable = (ticker: Ticker, opts?: Loopable.Options): Loopable => {
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
    ticker,
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
