import { state as _, scoped } from "./internal";
import { Loopable } from "./loopable";
import type { Ticker } from "./types";

/**
 * Represents loop that manages multiple loopable objects
 * @extends {Disposable}
 * @see {@link Loopable}
 */
export interface Loop extends Disposable {
  readonly id: number;

  /**
   * Time scale factor for the loop
   * Values greater than 1 speed up time, less than 1 slow it down
   */
  rate: number;

  /**
   * Indicates if the loop is currently running (processing loopabled)
   */
  readonly running: boolean;

  /**
   * Checks if a loopable is currently attached
   * @param {Loopable} loopable - The loopable to check
   * @returns {boolean} True if the loopable is registered to this loop
   */
  has(loopable: Loopable): boolean;

  /**
   * Registers an existing loopable to this loop
   * @param {Loopable} loopable - The loopable to register
   * @returns {Loopable} The registered loopable
   * @throws {Error} If the loopable is already running or registered to another loop
   */
  register<L extends Loopable>(loopable: L): L;

  /**
   * Constructs a new loopable and auto-registers
   * @param {Ticker} callback - Function to be called on each tick
   * @param {Loopable.Options} [opts] - Optional configuration settings
   * @returns {Loopable} The newly created and registered loopable
   */
  add(callback: Ticker, opts?: Loopable.Options): Loopable;

  /**
   * Removes a loopable from this loop
   * @param {Loopable} loopable - The loopable to remove
   * @returns {Loopable} The removed loopable
   * @throws {Error} If the loopable is registered to another loop
   */
  remove(loopable: Loopable): Loopable;

  /**
   * Removes all loopables from this loop
   */
  clear(): void;
}

export namespace Loop {
  export type Options = {
    rate?: number;
  };
}

/**
 * Creates a new Loop instance that manages the execution of loopables
 * The loop automatically starts when the first loopable is added and
 * stops when the last one is removed.
 *
 * @param {Loop.Options} [opts] - Optional configuration settings
 * @returns {Loop} A new Loop instance
 */
export const Loop = (opts?: Loop.Options): Loop => {
  const { rate: initialRate } = { rate: 1, ...opts } satisfies Required<Loop.Options>;

  const id = _.next++;
  let callbacks: Record<number, Record<Loopable["id"], Loopable>> = {};
  let removeQueue: Loopable[] = [];
  let running = false;
  let lastTime = 0;
  let inLoop = false;
  let rate = initialRate;

  const startLoop = () => {
    running = true;
    lastTime = performance.now();
    requestAnimationFrame(update);
  };

  const stopLoop = () => (running = false);

  const has: Loop["has"] = ({ id, priority }) => callbacks[priority][id] !== undefined;

  const register: Loop["register"] = loopable =>
    scoped(() => {
      if (loopable.running) {
        throw Error("loopable already running");
      }

      if (loopable.loop && loopable.loop.id !== self.id) {
        throw Error("loopable is registered to another loop instance");
      }

      const { id, priority } = loopable;

      if (!callbacks[priority]) {
        callbacks[priority] = {};
      }

      callbacks[priority][id] = loopable;

      if (!running) startLoop();

      loopable.loop = self;
      loopable.running = true;

      return loopable;
    });

  const add: Loop["add"] = (callback, opts) => register(Loopable(callback, opts));

  const remove: Loop["remove"] = loopable =>
    scoped(() => {
      if (loopable.loop && loopable.loop.id !== self.id) {
        throw Error("loopable is registered to another loop");
      }

      const { id, priority } = loopable;

      if (!has(loopable)) {
        return loopable;
      }

      if (inLoop) {
        removeQueue.push(loopable);
        return loopable;
      }

      delete callbacks[priority][id];

      loopable.running = false;

      if (Object.keys(callbacks[priority]).length === 0) {
        delete callbacks[priority];
      }

      if (Object.keys(callbacks).length === 0) stopLoop();

      return loopable;
    });

  const clear: Loop["clear"] = () => {
    Object.values(callbacks).forEach(priorityGroup =>
      Object.values(priorityGroup).forEach(loopable => loopable.stop())
    );
  };

  const update = (currentTime: number) => {
    inLoop = true;

    const dt = Math.max((currentTime - lastTime) * rate, 0) / 1000;
    lastTime = currentTime;

    const priorities = Object.keys(callbacks)
      .map(Number)
      .sort((a, b) => a - b);

    for (const priority of priorities) {
      const callbackGroup = callbacks[priority];
      for (const loopable of Object.values(callbackGroup)) {
        loopable.ticker(dt, loopable);
      }
    }

    inLoop = false;

    if (removeQueue.length > 0) {
      for (const loopable of removeQueue) {
        remove(loopable);
      }
      removeQueue = [];
    }

    if (running && Object.keys(callbacks).length > 0) {
      requestAnimationFrame(update);
    } else {
      stopLoop();
    }
  };

  const self: Loop = {
    id,
    get rate() {
      return rate;
    },

    set rate(t) {
      rate = t;
    },

    get running() {
      return running;
    },

    has,
    register,
    add,
    remove,
    clear,

    [Symbol.dispose]: clear,
  };

  return self;
};
