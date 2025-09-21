/**
 * Generic function signature
 *
 * @todo testing
 */
export type Callable = (...args: any[]) => any;

/**
 * Function that operates over `TInput` to produce `TOutput`
 * @template TInput input type
 * @template TOutput expected output type
 *
 * @todo testing
 */
export type Operator<TInput, TOutput = TInput> = (input: TInput) => TOutput;

export namespace Operator {
  /**
   * Async version of Operator
   * @template TInput input type
   * @template TOutput expected output type
   *
   * @todo testing
   */
  export type Async<TInput, TOutput = TInput> = (input: TInput) => Promise<TOutput>;
}

/**
 * Function that takes single `TFrom` value and maps it onto `TTo` value
 * @template TFrom input type
 * @template TTo output type
 *
 * @todo testing
 */
export type Mapper<TFrom, TTo> = (value: TFrom) => TTo;

/**
 * Function that takes no arguments and returns `TOutput`
 * @template TOutput the output type
 *
 * @todo testing
 */
export type Nullary<TOutput> = () => TOutput;

export namespace Nullary {
  /**
   * Nullary function that returns any type
   *
   * @todo testing
   */
  export type Any = Nullary<any>;

  /**
   * Async version of Nullary
   * @template TOutput the output type
   *
   * @todo testing
   */
  export type Async<TOutput> = Nullary<Promise<TOutput>>;
}

/**
 * Function that takes a single argument of type `A` and produces `TOutput`
 * @template A input type
 * @template TOutput the output type
 *
 * @todo testing
 */
export type Unary<A, TOutput> = (a: A) => TOutput;

export namespace Unary {
  /**
   * Async version of Unary
   * @template A input type
   * @template TOutput the output type
   *
   * @todo testing
   */
  export type Async<A, TOutput> = Unary<A, Promise<TOutput>>;
}

/**
 * Function that takes no arguments and always returns `void` (nothing)
 *
 * @todo testing
 */
export type Callback = () => void;

/**
 * @todo documentation
 * @todo testing
 */
export type Lazy = <TOutput>() => TOutput;

/**
 * @todo documentation
 * @todo testing
 */
export type Maker<TInstance, TArgs extends readonly any[]> = (...args: TArgs) => TInstance;

export namespace Maker {
  /**
   * Maker that can create any type with any arguments
   *
   * @todo testing
   */
  export type Any = Maker<any, any>;

  /**
   * Extract the arguments type from a Maker
   * @template TMaker the maker type to extract arguments from
   *
   * @todo testing
   */
  export type Args<TMaker extends Maker<any, any>> =
    TMaker extends Maker<any, infer TArgs> ? TArgs : never;

  /**
   * Extract the instance type from a Maker
   * @template TMaker the maker type to extract instance from
   *
   * @todo testing
   */
  export type Instance<TMaker extends Any> =
    TMaker extends Maker<infer TInstance, any> ? TInstance : never;
}

/**
 * Function that takes input and returns a boolean based on an arbitrary condition
 * @template TInput the input argument value type
 *
 * @todo testing
 */
export type Predicate<TInput> = (input: TInput) => boolean;

/**
 * Function to narrow input type based on a runtime check
 * @template TValue the expected output type of `input` given the boolean result
 *
 * @todo testing
 */
export type Guard<TValue> = (input: unknown) => input is TValue;

/**
 * Type guard to check if a value is a `Callable`.
 *
 * @param input The value to check.
 * @returns {boolean} `true` if the value is a function.
 *
 * @todo testing
 */
export const isCallable: Guard<Callable> = (input): input is Callable =>
  typeof input === "function";

/**
 * @alias {@link isCallable}
 *
 * @todo testing
 */
export const isFunction = isCallable;

/**
 * **N**o **O**peration **F**unction. Function that does nothing.
 *
 * @todo testing
 */
export const NOOF = () => {};

/**
 * **N**o **O**peration **P**rocedure. Function that does nothing.
 * @alias {@link NOOF}
 *
 * @todo testing
 */
export const NOOP = NOOF;
