import * as Function from '../function/index.js';
import * as Macro from '../macro/index.js';
import { Evaluable } from '../global/index.js';

/**
 * A type that can be either a Promise or a synchronous value.
 *
 * @template T The type of the value
 */
export type Maybe<T> = Promise<T> | T;

/**
 * A function that returns a Promise when called.
 *
 * @template T The type of the value the Promise resolves to
 */
export type Lazy<T> = () => Promise<T>;

export const wait: {
  /**
   * Waits for a specified duration
   *
   * @param millis The duration to wait in milliseconds
   * @returns A Promise that resolves after the specified duration
   */
  (millis: number): Promise<void>;

  /**
   * Waits for a specified duration and resolves with a value
   *
   * @param millis The duration to wait in milliseconds
   * @param value The value to resolve with
   * @returns A Promise that resolves after the specified duration with the given value
   */
  <V>(millis: number, value: Evaluable<V>): Promise<V>;
} = Macro.cast(
  <V>(millis: number, value?: Evaluable<V>) =>
    new Promise((resolve) => setTimeout(() => resolve(Macro.evaluate(value)), millis)),
);

/**
 * Waits for 1 millisecond (a single tick).
 *
 * @returns A Promise that resolves after 1 millisecond
 */
export const tick = () => wait(1);

export const withMinimumDuration: {
  /**
   * Ensures that a given promise resolves after at least a specified duration.
   *
   * @template T The type of the promise result
   * @param fn A function that returns a promise
   * @param duration The minimum delay duration
   * @returns A promise that resolves to the result of the given promise, but only after at least the specified delay duration
   */
  <T>(millis: number, task: Evaluable<Promise<T>>): Promise<T>;

  /**
   * Runs multiple async tasks concurrently, ensuring the entire batch
   * takes at least a specified duration to resolve.
   *
   * @param millis The minimum duration in milliseconds.
   * @param tasks A list of Promises or functions that return a Promise.
   * @returns A Promise that resolves with a tuple of the tasks' results.
   */
  <const TTasks extends readonly Evaluable<Promise<any>>[]>(
    millis: number,
    ...tasks: TTasks
  ): Promise<{
    -readonly [P in keyof TTasks]: TTasks[P] extends Promise<infer T>
      ? T
      : TTasks[P] extends () => Promise<infer T>
        ? T
        : never;
  }>;
} = Macro.cast(async (millis: number, ...tasks: Evaluable<Promise<any>>[]) => {
  const delayPromise = wait(millis);
  const taskPromises = tasks.map((task) => Macro.evaluate(task));

  const [results] = await Promise.all([Promise.all(taskPromises), delayPromise]);

  return tasks.length === 1 ? results[0] : results;
});

/**
 * Type guard to check if a value is a `Promise`.
 *
 * @param maybePromise The value to check.
 * @returns {boolean} `True` if the value is a Promise.
 */
export const isPromise = (thing: unknown): thing is Promise<unknown> =>
  thing instanceof Promise ||
  (thing !== null &&
    typeof thing === 'object' &&
    'then' in thing &&
    Function.isCallable(thing.then) &&
    'catch' in thing &&
    Function.isCallable(thing.catch));
