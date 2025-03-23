/**
 * A generic function signature
 */
export type Callable = (...args: any[]) => any;

/**
 * Function that operates over `Input` to produce `Output`
 * @template Input input type
 * @template Output expected output type
 */
export type Operator<Input, Output = Input> = (input: Input) => Output;

export namespace Operator {
  export type Async<Input, Output = Input> = (input: Input) => Promise<Output>;
}

/**
 * Function that takes single `From` value and maps it onto `To` value
 * @template From input type
 * @template To output type
 */
export type Mapper<From, To> = (value: From) => To;

/**
 * Function that takes no arguments and returns `Output`
 * @template Output the output type
 */
export type Nullary<Output> = () => Output;

export namespace Nullary {
  export type Any = Nullary<any>;
  export type Async<Output> = Nullary<Promise<Output>>;
}

/**
 * Function that takes a single argument of type `A` and produces `Output`
 * @template A input type
 * @template Output the output type
 */
export type Unary<A, Output> = (a: A) => Output;

export namespace Unary {
  export type Async<A, Output> = Unary<A, Promise<Output>>;
}

/**
 * Function that takes no arguments and always returns `void` (nothing)
 */
export type Callback = () => void;

/**
 * Function that takes input and returns a boolean based on an arbitrary condition
 * @template Input the input argument value type
 */
export type Predicate<Input> = (input: Input) => boolean;

/**
 * Function to narrow input type based on a runtime check
 * @template Value the expected output type of `input` given the boolean result
 */
export type Guard<Value> = (input: unknown) => input is Value;

/**
 * Type guard for to check if a value is a `Callable`.
 *
 * @param input The value to check.
 * @returns {boolean} `true` if the value is a function.
 */
export const isCallable: Guard<Callable> = (input): input is Callable =>
  typeof input === "function";

/**
 * @alias {@link isCallable}
 */
export const isFunction = isCallable;

/**
 * **N**o **O**peration **F**unction. Function that does nothing.
 */
export const NOOF = () => {};

/**
 * **N**o **O**peration **P**rocedure. Function that does nothing.
 * @alias {@link NOOF}
 */
export const NOOP = NOOF;
