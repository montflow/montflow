import { state as _ } from "./internal";
import { Loop } from "./loop";
import { Loopable } from "./loopable";

/**
 * Represents a timeout that executes a callback after a specified duration.
 * Extends the `Loopable` interface.
 * @extends {Loopable}
 * @see {@link Loopable}
 */
export interface Timeout extends Loopable {
  /**
   * Duration (in seconds) until the timeout completes.
   * Unlike Interval, this cannot be modified during execution.
   * @readonly
   */
  readonly duration: number;

  /**
   * Total elapsed time for the current timeout.
   * Increases with each tick until reaching duration.
   * @readonly
   */
  readonly elapsed: number;
}

export namespace Timeout {
  /**
   * Options for configuring the `Timeout` instance.
   * Extends the options available for `Loopable`.
   */
  export type Options = Loopable.Options & {
    /**
     * Duration in milliseconds until the timeout completes.
     */
    duration: number;

    /**
     * Callback executed when the timeout completes.
     * @param {Timeout} self - The timeout instance.
     */
    onComplete?: (self: Timeout) => void;
  };
}

/**
 * Creates a new `Timeout` instance.
 * Manages a one-time delayed execution after a specified duration.
 *
 * @param {Timeout.Options} opts - Configuration options for the timeout.
 * @returns {Timeout} A new timeout instance.
 */
export const Timeout = (opts: Timeout.Options): Timeout => {
  const {
    onComplete,
    duration: initialDuration,
    priority = 0,
  } = {
    ...opts,
  } satisfies Timeout.Options;

  const id = _.next++;
  let running = false;
  let loop: Loop | undefined = undefined;
  let elapsed = 0;
  const duration = initialDuration / 1000;

  const stop: Timeout["stop"] = () => {
    if (!loop || !running) return;
    loop.remove(self);
  };

  const start: Timeout["start"] = () => {
    if (!loop || running) return;
    loop.register(self);
  };

  const ticker: Timeout["ticker"] = dt => {
    elapsed += dt;
    if (elapsed >= duration) {
      self.stop();
      onComplete?.(self);
    }
  };

  const self: Timeout = {
    id,
    priority,
    ticker,
    stop,
    start,

    get running() {
      return running;
    },

    set running(r) {
      if (!_.inContext) {
        console.warn("modifying timeout.running will cause undefined behavior");
      }
      running = r;
    },

    get loop() {
      return loop;
    },

    set loop(l) {
      if (!_.inContext) {
        console.warn("modifying timeout.loop will cause undefined behavior");
      }
      loop = l;
    },

    get duration() {
      return duration;
    },

    get elapsed() {
      return elapsed;
    },

    [Symbol.dispose]: function () {
      this.stop();
    },
  };

  return self;
};
