import { Evaluable } from "../common/index.js";
import * as Function from "../function/index.js";

/**
 * Executes a function that takes no arguments and returns its result.
 * @template T return type of the function
 * @param {() => T} fn function to execute
 * @returns {T} result of the function execution
 */
export const lambda = <T>(fn: () => T): T => fn();

/**
 * Throws the provided error and never returns.
 * @template E error kind
 * @param {E} error error to throw
 * @throws {E} always throws the provided error
 */
export const panic = <const E>(error: E): never => {
  throw error;
};

/**
 * Casts an unknown value to the specified type without runtime checks.
 * @template To target type to cast to
 * @param {unknown} x value to cast
 * @returns {To} value cast to target type
 */
export const cast = <To>(x: unknown): To => x as To;

/**
 * Asserts that a value is of the specified type without runtime checks.
 * @template Type type to assert
 * @param {unknown} _ value to assert
 * @returns {boolean} always returns true
 */
export const assertType = <Type>(_: unknown): _ is Type => true;

/**
 * Evaluates a value or function and returns the result.
 * @template T type of the value or function return
 * @param {T | (() => T)} resolvable value or function to evaluate
 * @returns {T} resolved value
 */
export const evaluate = <T>(resolvable: Evaluable<T>): T =>
  Function.isCallable(resolvable) ? resolvable() : resolvable;

export const todo = (msg?: string) => panic(Error(msg));

export namespace Dualify {
  export type Options =
    | { withTail?: false }
    | { withTail: true; isSelf: (self: unknown) => boolean };
}

/**
 * @exprimental
 *
 * Creates a function that can be used in both explicit and curried styles.
 *
 * @param arity The number of arguments (excluding `self` and `tail`) expected for the function.
 * @param body The explicit version of the function.
 * @param options Optional configuration:
 *   - `withTail`: Indicates if the function should includes an additional "tail" argument.
 *   - `isSelf`: Predicate to determine if the first argument is the `self` reference.
 *
 * @returns A dual-style function supporting both explicit and curried usage.
 *
 * @example
 * ```ts
 * const sum = Macro.dualify(1, (self: number, that: number) => self + that);
 *
 * // Explicit style
 * sum(2, 3); // 5
 *
 * // Curried style
 * const addTo2 = sum(2); // (self: number) => number
 * addTo2(3); // 5
 *
 * // With `pipe` (curried style)
 * pipe(3, sum(2)); // 5
 * ```
 *
 * @copyright major credit to [`effect/Function.ts`](https://github.com/Effect-TS/effect/blob/main/packages/effect/src/Function.ts)
 */
export const dualify = <Explicit extends Function.Callable, Curried extends Function.Callable>(
  arity: number,
  body: Explicit,
  options?: Dualify.Options
): Explicit & Curried => {
  const opts: Required<Dualify.Options> = { withTail: false, ...options };

  if (Number.isNaN(arity)) {
    throw new Error(`Invalid arity ${arity}. Must be a number.`);
  }

  if (arity < 0) {
    throw new RangeError(`Invalid arity ${arity}. Must be < 0`);
  }

  if (!Number.isInteger(arity)) {
    throw new Error(`Invalid arity ${arity}. Must be an interger`);
  }

  /**
   * When arity = x
   *
   * 1. withTail = true & has NO tail
   *    - Non-curried: (self, ...args) where args.length = x [args=x+1]
   *    - Curried: (...args) => (self) where args.length = x [args=x]
   *
   * 2. withTail = true & has tail
   *    - Non-curried: (self, ...args, tail) where args.length = x, and tail is an additional parameter [args=x+2]
   *    - Curried: (...args, tail) => (self) where args.length = x+1 [args=x+1]
   *
   * 3. withTail = false
   *    - Non-curried: (self, ...args) where args.length = x [args=x+1]
   *    - Curried: (...args) => (self) where args.length = x [args=x]
   */

  if (opts.withTail) {
    // @ts-expect-error
    return (...args) => {
      switch (args.length) {
        case arity: {
          return (self: unknown) => body(self, ...args);
        }

        case arity + 1: {
          const first = args[0];
          return opts.isSelf(first) ? body(...args) : (self: unknown) => body(self, ...args);
        }

        case arity + 2: {
          return body(...args);
        }

        default: {
          throw new Error("invalid arguments");
        }
      }
    };
  }

  switch (arity) {
    case 0: {
      return ((...args) =>
        args.length !== 0 ? body(...args) : (self: unknown) => body(self)) as Explicit &
        Curried;
    }

    default: {
      return ((...args) => {
        return args.length > arity ? body(...args) : (self: unknown) => body(self, ...args);
      }) as Explicit & Curried;
    }
  }
};
