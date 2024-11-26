import { Loopable } from "./loopable";

export interface Timeout extends Loopable {
  readonly duration: number;
  readonly elapsed: number;
}

export namespace Timeout {
  export type Options = Loopable.Options & {
    duration: number;
    onComplete?: (self: Timeout) => void;
  };
}

export const Timeout = (opts: Timeout.Options): Timeout => {
  const { onComplete, duration, ...rest } = { ...opts } satisfies Timeout.Options;

  let elapsed: Timeout["elapsed"] = 0;

  const loopable = Loopable(
    (dt, self) => {
      elapsed += dt;
      if (elapsed >= duration) {
        self.stop();
        onComplete?.(_self);
      }
    },
    { ...rest }
  );

  const _self: Timeout = {
    get duration() {
      return duration;
    },
    get elapsed() {
      return elapsed;
    },
    ...loopable,
  };

  return _self;
};
