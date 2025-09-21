import { Duration } from "effect";

import * as Function from "../function/index.js";
import { Evaluable } from "../global/index.js";
import * as Macro from "../macro/index.js";

/**
 * A type that can be either a Promise or a synchronous value.
 * @template T The type of the value
 *
 * @todo testing
 */
export type Maybe<T> = Promise<T> | T;

/**
 * A function that returns a Promise when called.
 * @template T The type of the value the Promise resolves to
 *
 * @todo testing
 */
export type Lazy<T> = () => Promise<T>;

/**
 * Waits for a specified duration, optionally returning a value.
 * @template V The type of the value to return
 * @param duration The duration to wait
 * @param value Optional value to return after waiting
 * @returns A Promise that resolves after the specified duration
 *
 * @todo testing
 */
export const wait: {
  (duration: Duration.DurationInput): Promise<void>;
  <V>(duration: Duration.DurationInput, value: Evaluable<V>): Promise<V>;
} = <V = unknown>(duration: Duration.DurationInput, value?: Evaluable<V>): Promise<V> =>
  new Promise(resolve =>
    setTimeout(
      () => (value ? resolve(Macro.evaluate(value)) : resolve(Macro.never)),
      Duration.toMillis(duration)
    )
  );

/**
 * Waits for 1 millisecond (a single tick).
 * @returns A Promise that resolves after 1 millisecond
 *
 * @todo testing
 */
export const tick = () => wait("1 millis");

/**
 * Ensures that a given promise resolves after at least a specified duration.
 * @template T The type of the promise result
 * @param fn A function that returns a promise
 * @param duration The minimum delay duration
 * @returns A promise that resolves to the result of the given promise, but only after at least the specified delay duration
 *
 * @todo implementation
 */
export const withMinimumDuration: {
  <T>(fn: Function.Nullary.Async<T>, duration: Duration.DurationInput): Promise<T>;
} = Macro.todoImpl;

/**
 * Type guard to check if a value is a `Promise`.
 *
 * @param maybePromise The value to check.
 * @returns {boolean} `True` if the value is a Promise.
 */
export const isPromise = (thing: unknown): thing is Promise<unknown> =>
  thing instanceof Promise ||
  (thing !== null &&
    typeof thing === "object" &&
    "then" in thing &&
    Function.isCallable(thing.then) &&
    "catch" in thing &&
    Function.isCallable(thing.catch));
