import { dualify, isCallable, Nullary } from "../function";

/**
 * Returns a promise that resolves after a specified delay.
 * @param {number} ms the delay duration in milliseconds.
 * @returns {Promise<void>} A promise that resolves after the specified delay.
 */
export function delay(ms: number): Promise<void>;

/**
 * Returns a promise that resolves with a specified value after a specified delay.
 * @template V returned value
 * @param {number} ms The delay duration in milliseconds.
 * @param {V} value The value to be resolved after the delay.
 * @returns {Promise<V>} A promise that resolves with the specified value after the specified delay.
 */
export function delay<V>(ms: number, value: V): Promise<V>;

export function delay<V>(ms: number, value: V | undefined = undefined) {
  return new Promise(resolve => setTimeout(() => resolve(value), ms));
}
/**
 * @todo
 */
export function tick() {
  return delay(1);
}

/**
 * Ensures that a given promise resolves after at least a specified duration.
 * @template T the type of the promise result.
 * @param {Nullary.Async} fn a function that returns a promise.
 * @param {number} duration the minimum delay duration in milliseconds.
 * @returns {Promise<T>} a promise that resolves to the result of the given promise, but only after at least the specified delay duration.
 */
export async function withMinimumDuration<T>(
  fn: Nullary.Async<T>,
  duration: number
): Promise<T> {
  const [result] = await Promise.all([fn(), delay(duration)]);
  return result;
}

/**
 * Type guard to check if a value is a `Promise`.
 *
 * @param maybePromise The value to check.
 * @returns {boolean} `True` if the value is a Promise.
 */
export const isPromise: {
  (self: unknown): self is Promise<unknown>;
  (): (self: unknown) => self is Promise<unknown>;
} = dualify(
  1,
  (self: unknown): self is Promise<unknown> =>
    self instanceof Promise ||
    (self !== null &&
      typeof self === "object" &&
      "then" in self &&
      isCallable(self.then) &&
      "catch" in self &&
      isCallable(self.catch))
);
