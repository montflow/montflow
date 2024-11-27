import { state as _ } from "./internal";
import { Loop } from "./loop";
import { Loopable } from "./loopable";

/**
 * Represents an interval that runs for a specified duration with an optional maximum iteration limit.
 * Extends the `Loopable` interface.
 * @extends {Loopable}
 * @see {@link Loopable}
 */
export interface Interval extends Loopable {
  /**
   * Duration (ms) of the interval in seconds.
   * Determines how often the interval will tick.
   * Can be modified, during loop.
   */
  duration: number;

  /**
   * Maximum number of iterations for the interval.
   * If set to `"infinite"`, the interval will run indefinitely until stopped.
   */
  readonly maxIterations: number | "infinite";

  /**
   * Total elapsed time for the current interval.
   * Resets after each iteration.
   */
  readonly elapsed: number;

  /**
   * Total number of iterations completed.
   */
  readonly iterations: number;
}

export namespace Interval {
  /**
   * Options for configuring the `Interval` instance.
   * Extends the options available for `Loopable`.
   */
  export type Options = Loopable.Options & {
    /**
     * Callback executed after each iteration of the interval.
     * @param {Interval} self - The interval instance.
     */
    onIteration?: (self: Interval) => void;

    /**
     * Callback executed when the interval completes its maximum iterations.
     * @param {Interval} self - The interval instance.
     */
    onComplete?: (self: Interval) => void;

    /**
     * Duration of each interval iteration in milliseconds.
     */
    duration: Interval["duration"];

    /**
     * Maximum number of iterations for the interval.
     * @default `"infinite"`
     */
    maxIterations?: Interval["maxIterations"];
  };
}

/**
 * Creates a new `Interval` instance.
 * Manages time-based iteration over a specified duration with optional callbacks.
 *
 * @param {Interval.Options} opts - Configuration options for the interval.
 * @returns {Interval} A new interval instance.
 */
export const Interval = (opts: Interval.Options): Interval => {
  const {
    onIteration,
    onComplete,
    duration: initialDuration,
    maxIterations = "infinite",
    priority = 0,
  } = { ...opts } satisfies Interval.Options;

  const id = _.next++;
  let running = false;
  let loop: Loop | undefined = undefined;
  let elapsed = 0;
  let iterations = 0;
  let duration = initialDuration / 1000;

  const stop: Interval["stop"] = () => {
    if (!loop || !running) return;
    loop.remove(self);
  };

  const start: Interval["start"] = () => {
    if (!loop || running) return;
    loop.register(self);
  };

  const ticker: Interval["ticker"] = dt => {
    elapsed += dt;

    while (elapsed >= duration) {
      elapsed -= duration;
      iterations++;

      onIteration?.(self);

      if (self.running && maxIterations !== "infinite" && iterations >= maxIterations) {
        self.stop();
        onComplete?.(self);
        break;
      }
    }
  };

  const self: Interval = {
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
        console.warn("modifying interval.running will cause undefined behavior");
      }
      running = r;
    },

    get loop() {
      return loop;
    },

    set loop(l) {
      if (!_.inContext) {
        console.warn("modifying interval.loop will cause undefined behavior");
      }
      loop = l;
    },

    get duration() {
      return duration;
    },

    set duration(value) {
      duration = value;
    },

    get maxIterations() {
      return maxIterations;
    },

    get elapsed() {
      return elapsed;
    },

    get iterations() {
      return iterations;
    },

    [Symbol.dispose]: function () {
      this.stop();
    },
  };

  return self;
};
