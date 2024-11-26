import { state as _ } from "./internal";
import { Loopable } from "./loopable";

export type Priority = number;
export type StepCallback = (dt: number, self: Loopable) => any;

export interface Loop extends Disposable {
  readonly id: number;
  rate: number;
  readonly running: boolean;

  has(loopable: Loopable): boolean;
  register(loopable: Loopable): Loopable;
  add(callback: StepCallback, opts?: Loopable.Options): Loopable;
  remove(loopable: Loopable): Loopable;
  clear(): void;
}

const scoped = <T = void>(fn: () => T): T => {
  _.inContext = true;
  const val = fn();
  _.inContext = false;
  return val;
};

export const Loop = (): Loop => {
  const id = _.next++;
  let callbacks: Record<Priority, Record<Loopable["id"], Loopable>> = {};
  let removeQueue: Loopable[] = [];
  let running = false;
  let lastTime = 0;
  let inLoop = false;
  let rate = 1;

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
        loopable.callback(dt, loopable);
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
