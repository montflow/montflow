import * as Constructor from "../constructor/index.js";
import * as Function from "../function/index.js";
import { Evaluable, Table } from "../global/index.js";

/**
 * Executes a function that takes no arguments and returns its result.
 * Basically a nicer IIFE utility.
 *
 * @template T return type of the function
 * @param {Function.Nullary<T>} fn original function
 * @returns {T} result of the function execution
 *
 * @todo testing
 */
export const lambda = <T>(fn: Function.Nullary<T>): T => fn();

/**
 * Casts an unknown value to the specified type without runtime checks.
 * @template To target type to cast to
 * @param {unknown} x value to cast
 * @returns {T} value cast to target type
 *
 * @todo testing
 */
export const cast = <T>(x: unknown): T => x as T;

const _singletons: Table<string, Constructor.Any | Function.Maker.Any> = {};

/**
 * @todo documentation
 * @todo testing
 */
export class SingletonAlreadyExistsError extends Error {
  constructor(id: string) {
    super(`Singleton ${id} already exists`);
  }
}

/**
 * @todo documentation
 * @todo testing
 */
export const singleton: {
  <TConstructor extends Constructor.Any>(
    id: string,
    ctor: TConstructor,
    ...args: Constructor.Args<TConstructor>
  ): () => Constructor.Instance<TConstructor>;

  <TMaker extends Function.Maker.Any>(
    id: string,
    ctor: TMaker,
    ...args: Function.Maker.Args<TMaker>
  ): () => Function.Maker.Instance<TMaker>;
} = <TConstructor extends Constructor.Any | Function.Maker.Any>(
  id: string,
  ctor: TConstructor,
  ...args: TConstructor extends Constructor.Any ? Constructor.Args<TConstructor>
  : TConstructor extends Function.Maker.Any ? Function.Maker.Args<TConstructor>
  : never
) => {
  if (_singletons[id]) {
    throw panic(new SingletonAlreadyExistsError(id));
  }

  return () => {
    if (_singletons[id]) {
      return _singletons[id];
    }

    const instance =
      Constructor.isConstructor(ctor) ? new ctor(...args)
      : Function.isCallable(ctor) ? ctor(...args)
      : void 0;

    if (instance === void 0) {
      // TODO: create a custom error
      throw panic(new Error("Invalid singleton"));
    }

    return (_singletons[id] = instance);
  };
};

/**
 * @todo documentation
 * @todo testing
 */
export const never = cast<never>(void 0);

/**
 * @todo documentation
 * @todo testing
 */
export const unknown = cast<unknown>(void 0);

/**
 * @todo documentation
 * @todo testing
 */
export const undefined = cast<undefined>(void 0);

/**
 * @todo documentation
 * @todo testing
 */
const _void = cast<void>(void 0);

export { _void as void };

/**
 * @todo documentation
 * @todo testing
 */
export const panic: {
  <E>(error: E): never;
  (message: string): never;
} = <E>(errorOrMessage: E | string) => {
  if (typeof errorOrMessage === "string") {
    throw new Error(errorOrMessage);
  }

  throw errorOrMessage;
};

/**
 * Evaluates a value or function and returns the result.
 *
 * @template T type of the value or function return
 * @param {Evaluable<T>} evaluable value or function to evaluate
 * @returns {T} resolved value
 */
export const evaluate = <T>(evaluable: Evaluable<T>): T =>
  Function.isCallable(evaluable) ? evaluable() : evaluable;

/**
 * @todo documentation
 * @todo testing
 */
export const todo = (message?: string) => panic(message ?? "todo");

/**
 * @alias todo
 * @see {@link todo}
 */
export const placeholder = todo;

/**
 * @todo documentation
 * @todo testing
 */
export const todoImpl = () => todo("missing implementation");

/**
 * @todo documentation
 */
export namespace Dualify {
  export type Options =
    | { withTail?: false }
    | { withTail: true; isSelf: (self: unknown) => boolean };
}

/**
 * @experimental
 *
 * Creates a function that can be used in both explicit and curried styles.
 *
 * @template Explicit The explicit function type
 * @template Curried The curried function type
 * @param arity The number of arguments (excluding `self` and `tail`) expected for the function.
 * @param body The explicit version of the function.
 * @param options Optional configuration:
 *   - `withTail`: Indicates if the function should includes an additional "tail" argument.
 *   - `isSelf`: Predicate to determine if the first argument is the `self` reference.
 *
 * @returns A dual-style function supporting both explicit and curried usage.
 * @todo testing
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
