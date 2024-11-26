import { Loopable } from "./loopable";

export interface Interval extends Loopable {
  duration: number;

  readonly maxIterations: number | "infinite";
  readonly elapsed: number;
  readonly iterations: number;
}

export namespace Interval {
  export type Options = Loopable.Options & {
    onIteration?: (self: Interval) => void;
    onComplete?: (self: Interval) => void;
    duration: Interval["duration"];
    maxIterations?: number;
  };
}

export const Interval = (opts: Interval.Options): Interval => {
  const {
    onIteration,
    onComplete,
    duration: initialDuration,
    maxIterations = "infinite",
    ...rest
  } = { ...opts } satisfies Interval.Options;

  let elapsed: Interval["elapsed"] = 0;
  let iterations: Interval["iterations"] = 0;
  let duration = initialDuration;

  const loopable = Loopable(
    (dt, self) => {
      elapsed += dt;

      while (elapsed >= duration) {
        elapsed -= duration;
        iterations++;

        onIteration?.(_self);

        if (maxIterations !== "infinite" && iterations >= maxIterations) {
          self.stop();
          onComplete?.(_self);
          break;
        }
      }
    },
    { ...rest }
  );

  const _self: Interval = {
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
    ...loopable,
  };

  return _self;
};
