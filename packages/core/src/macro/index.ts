import * as Constructor from "../constructor/index.js";
import * as Function from "../function/index.js";
import { Evaluable, Struct } from "../global/index.js";
import * as Text from "../text/index.js";

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

/** @internal */
const _singletons: Struct<string, Constructor.Any | Function.Maker.Any> = {};

/** @internal */
const _onces: Struct<string, { hasRun: boolean; result: any; fn: Function.Callable }> = {};

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
 */
export class OnceAlreadyExistsError extends Error {
  constructor(id: string) {
    super(`Once function with id ${id} already exists`);
  }
}

export const singleton: {
  /**
   * Creates a proxy constructor that allocates the a created
   * instance only once. The instance is created when and if the
   * returned function is ever invoked.
   *
   * @template TConstructor the constructor type
   * @param id the id of the singleton. Must be unique project wide.
   * @param ctor the constructor to create the singleton
   * @param args the arguments to pass to the constructor
   * @returns a function that returns the singleton instance
   *
   * @todo testing
   */
  <TConstructor extends Constructor.Any>(
    id: string,
    ctor: TConstructor,
    ...args: Constructor.Args<TConstructor>
  ): () => Constructor.Instance<TConstructor>;

  /**
   * Creates a proxy constructor that allocates the a created
   * instance only once. The instance is created when and if the
   * returned function is ever invoked.
   *
   * @template TMaker the maker type
   * @param id the id of the singleton. Must be unique project wide.
   * @param ctor the maker to create the singleton
   * @param args the arguments to pass to the maker
   * @returns a function that returns the singleton instance
   *
   * @todo testing
   */
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
  if (_singletons[id] !== undefined) {
    throw panic(new SingletonAlreadyExistsError(id));
  }

  _singletons[id] = ctor;

  return () => {
    const existing = _singletons[id];

    // If the value is a constructor or function, instantiate it
    if (Constructor.isConstructor(existing) || Function.isCallable(existing)) {
      const instance =
        Constructor.isConstructor(ctor) ? new ctor(...args)
        : Function.isCallable(ctor) ? ctor(...args)
        : void 0;

      if (instance === void 0) {
        // TODO: create a custom error
        throw panic(new Error("Invalid singleton"));
      }

      return (_singletons[id] = instance);
    }

    return existing;
  };
};

export const once: {
  /**
   * Creates a function that executes only on its first invocation.
   * Subsequent calls return the cached result without re-executing.
   *
   * @template TFunction the function type (nullary)
   * @param id the id of the once function. Must be unique project wide.
   * @param fn the function to execute once
   * @returns a function that executes only once
   */
  <TFunction extends Function.Nullary<any>>(
    id: string,
    fn: TFunction
  ): () => ReturnType<TFunction>;

  /**
   * Creates a function that executes only on its first invocation with the provided arguments.
   * Subsequent calls return the cached result without re-executing.
   *
   * @template TFunction the function type
   * @param id the id of the once function. Must be unique project wide.
   * @param fn the function to execute once
   * @param args the arguments to pass to the function
   * @returns a nullary function that executes only once
   */
  <TFunction extends Function.Callable>(
    id: string,
    fn: TFunction,
    ...args: Parameters<TFunction>
  ): () => ReturnType<TFunction>;
} = <TFunction extends Function.Callable>(id: string, fn: TFunction, ...args: any[]): any => {
  if (_onces[id]) {
    throw panic(new OnceAlreadyExistsError(id));
  }

  _onces[id] = { hasRun: false, result: undefined, fn };

  return () => {
    if (!_onces[id].hasRun) {
      _onces[id].result = _onces[id].fn(...args);
      _onces[id].hasRun = true;
    }
    return _onces[id].result;
  };
};

/**
 * @alias never
 *
 * Value of type `never`. Just an `undefined` during runtime.
 */
export const never = cast<never>(void 0);

/**
 * @alias unknown
 *
 * Value of type `unknown`. Just an `undefined` during runtime.
 */
export const unknown = cast<unknown>(void 0);

/**
 * @alias undefined
 *
 * Value of type `undefined`. Just an `void 0` during runtime.
 */
export const undefined = cast<undefined>(void 0);

/**
 * @alias void
 *
 * Value of type `void`. Just an `undefined` during runtime.
 */
const _void = cast<void>(void 0);

export { _void as void };

/**
 * @alias null
 */
const _null = null;

export { _null as null };

export const panic: {
  /**
   * Throws an error or a message.
   *
   * @template E the error type
   * @param error the error to throw
   * @returns never
   * @throws {E} the error
   *
   * @todo testing
   */
  <E>(error: E): never;

  /**
   * Throws an error or a message.
   *
   * @template E the error type
   * @param message the message to throw
   * @returns never
   * @throws {Error} with the message
   *
   * @todo testing
   */
  (message: string): never;
} = <E>(errorOrMessage: E | string) => {
  if (Text.isString(errorOrMessage)) {
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
 * Throws a `todo` error. Meant to be used as a development placeholder.
 *
 * @param message the message to throw
 * @returns never
 * @throws {Error} with the message
 *
 * @todo testing
 */
export const todo = (message?: string) => panic(message ?? "todo");

/**
 * @alias todo
 * @see {@link todo}
 */
export const placeholder = todo;

/**
 * Throws a `todo` error. Meant to be used as
 * a development placeholder for missing implementation.
 *
 * @param message the message to throw
 * @returns never
 * @throws {Error} with the message
 */
export const todoImpl = () => todo("missing implementation");

export namespace Dualify {
  /**
   * Dualify options.
   *
   * @see {@link dualify}
   */
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

/**
 * Asserts a condition.
 *
 * @param condition The condition to assert
 * @param error The error to throw if the condition is false
 *
 * @todo testing
 */
export const assert = (condition: Evaluable<boolean>, error?: Error | string) => {
  if (!evaluate(condition)) {
    throw panic(error ?? "Assertion failed");
  }
};
