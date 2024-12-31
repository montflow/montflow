import { Predicate } from "solzu";
import { isFunction, Mapper, Nullary, Operator } from "../function";
import { evaluate, panic } from "../macro";
import { Maybe, None, Some } from "../maybe";
import { Nothing } from "../nothing";
import { Decrement } from "../types";

/**
 * Represents the successful outcome of operation
 * @template V type of inner value
 */
export type Ok<V> = {
  readonly ok: true;
  readonly value: V;
};

/**
 * Represents the unsuccessful outcome of operation
 * @template E type of inner error
 */
export type Err<E> = {
  readonly ok: false;
  readonly error: E;
};

/**
 * @internal
 */
export const MAX_UNFOLD_DEPTH = 512;

/**
 * Either `Ok<V>` or `Err<E>`
 * @template V type of some's inner value
 */
export type Result<V = Nothing, E = Nothing> = Ok<V> | Err<E>;

/**
 * Generic `Result` type. Extends `any` other result
 */
export type Any = Result<any, any>;

/**
 * Extracts the inner `Ok` value type
 * @template TResult input `Result` type
 * @returns inner `Ok` value type
 */
export type ValueOf<TResult extends Any> = TResult extends Ok<infer V> ? V : never;

/**
 * Extracts the inner `Err` type
 * @template TResult any `Result`
 * @returns inner `Err` type
 */
export type ErrorOf<TResult extends Any> = TResult extends Err<infer E> ? E : never;

/**
 * Unwraps nested `Result` type once
 * @template Root input `Result` type to flatten
 * @returns `Result` flattened once. Root and nested `Err`s are combined (union) for resulting `Err` type
 */
export type Flatten<Root extends Any> = [Root] extends [Result<infer RootOk, infer RootErr>]
  ? [RootOk] extends [Result<infer NestedOk, infer NestedErr>]
    ? Result<NestedOk, RootErr | NestedErr>
    : Root
  : never;

/**
 * Recursively unwraps nested `Result` type **infinitely**. Not recommended for general use. Try simpler versions like `Flatten` or `Unfold`
 * @template Root `Result` type to unfold
 * @returns `Result` of depth 1. All `Err`'s are combined onto single union `Err`
 * @see {@link Result.Flatten}
 * @see {@link Result.Unfold}
 */
export type InfiniteUnfold<Root extends Any> = [Root] extends [
  Result<infer RootOk, infer RootErr>,
]
  ? [RootOk] extends [Result<infer NestedOk, infer NestedErr>]
    ? InfiniteUnfold<Result<NestedOk, NestedErr | RootErr>>
    : Root
  : never;

/**
 * Recursively flattens nested `Result` type up to `Limit`. For an **infinite** version checkout `Result.InfiniteUnfold` or simpler `Result.Flatten`
 * @template Root `Result` type to unfold
 * @returns `Result` of depth 1 if depth ≤ `Limit`. Otherwise the unfolded result up to `Limit`
 * @see {@link Result.InfiniteUnfold}
 * @see {@link Result.Flatten}
 */
export type Unfold<
  Root extends Any,
  Limit extends number = typeof MAX_UNFOLD_DEPTH,
> = Limit extends 0
  ? Root
  : [Root] extends [Result<infer RootOk, infer RootErr>]
    ? [RootOk] extends [Result<infer NestedOk, infer NestedErr>]
      ? Unfold<Result<NestedOk, NestedErr | RootErr>, Decrement<Limit>>
      : Root
    : never;

/**
 * Shorthand for `Promise` of a `Result`
 * @template V inner `Ok` value type. Defaults to `Nothing`
 * @template E inner `Err` error type. Defaults to `Nothing`
 * @returns {Promise<Result<V, E>>}
 */
export type Async<V = Nothing, E = Nothing> = Promise<Result<V, E>>;

/**
 * Creates empty `Ok`
 * @constructor
 * @returns {Ok<Nothing>} empty `Ok`
 */
export function Ok(): Ok<Nothing>;

/**
 * Creates `Ok` w/ inner `value`
 * @constructor
 * @template V inner `value` type
 * @param {V} value
 * @returns {Some<V>} `Ok` with inner `value`
 */
export function Ok<V>(value: V): Ok<V>;

/**
 * @internal
 */
export function Ok<V>(value?: V): Ok<V> | Ok<Nothing> {
  return {
    ok: true,
    value: value !== undefined ? value : Nothing(),
  } as Ok<V> | Ok<Nothing>;
}

/**
 * Creates empty `Err`
 * @constructor
 * @returns {Err<Nothing>} empty `Err`
 */
export function Err(): Err<Nothing>;

/**
 * Creates `Err` w/ inner `error`
 * @constructor
 * @template E inner `error` type
 * @param {E} error
 * @returns {Err<E>} `Err` with inner `error`
 */
export function Err<E>(error: E): Err<E>;

/**
 * @internal
 */
export function Err<E>(error?: E): Err<E> | Err<Nothing> {
  return {
    ok: false,
    error: error !== undefined ? error : Nothing(),
  } as Err<E> | Err<Nothing>;
}

/**
 * Creates `Ok` with type of `Result<Nothing, Nothing>`
 * @constructor
 * @param {"ok"} kind
 * @returns {Result<Nothing, Nothing>} `Result` of type `Ok<Nothing>`
 */
export function Result(kind: "ok"): Result<Nothing, Nothing>;

/**
 * Creates `Ok` with type of `Result<V, Nothing>`
 * @constructor
 * @template V type of inner `Ok` value
 * @param {"ok"} kind
 * @param {V} value inner `Ok` value
 * @returns {Result<V, Nothing>} `Result` of type `Ok` with inner `value`
 */
export function Result<V>(kind: "ok", value: V): Result<V, Nothing>;

/**
 * Creates `Ok` with type of `Result<V, E>`
 * @constructor
 * @template V type of inner `Ok` value
 * @template E type of inner `Err` error
 * @param {"ok"} kind
 * @param {V} value inner `Ok` value
 * @returns {Result<V, E>} `Result` of type `Ok` with inner `value`
 */
export function Result<V = Nothing, E = Nothing>(kind: "ok", value: V): Result<V, E>;

/**
 * Creates `Err` with type of `Result<Nothing, Nothing>`
 * @constructor
 * @param {"err"} kind
 * @returns {Result<Nothing, Nothing>} `Result` of type `Err<Nothing>`
 */
export function Result(kind: "err"): Result<Nothing, Nothing>;

/**
 * Creates `Err` with type of `Result<Nothing, E>`
 * @constructor
 * @template E type of inner `Err` error
 * @param {"err"} kind
 * @param {E} error inner `Err` error
 * @returns {Result<Nothing, E>} `Result` of type `Err` with inner `error`
 */
export function Result<E>(kind: "err", error: E): Result<Nothing, E>;

/**
 * Creates `Err` with type of `Result<V, E>`
 * @constructor
 * @template V type of inner `Ok` value
 * @template E type of inner `Err` error
 * @param {"err"} kind
 * @param {E} error inner `Err` error
 * @returns {Result<V, E>} `Result` of type `Err` with inner `error`
 */
export function Result<V = Nothing, E = Nothing>(kind: "err", error: E): Result<V, E>;

/**
 * @internal
 */
export function Result<ValueOrError, Error>(
  kind: "ok" | "err",
  valueOrError?: ValueOrError | Error
):
  | Result<Nothing, Nothing>
  | Result<ValueOrError, Nothing>
  | Result<Nothing, ValueOrError>
  | Result<ValueOrError, Error> {
  switch (true) {
    case kind === "err" && valueOrError !== undefined:
      // Err<E> => Result<Nothing, E> or Result<V, E>
      return Err(valueOrError as Error);

    case kind === "err" && valueOrError === undefined:
      // Err<Nothing> => Result<Nothing, Nothing>
      return Err();

    case kind === "ok" && valueOrError !== undefined:
      // Ok<V> => Result<V, Nothing> or Result<V, E>
      return Ok(valueOrError as ValueOrError);

    default:
    case kind === "ok" && valueOrError === undefined:
      // Ok<Nothing> => Result<Nothing, Nothing>
      return Ok();
  }
}

/**
 * Converts procedure that could potentially throw into `Result`
 * @constructor
 * @template V inner `Ok` value type
 * @template E inner `Err` error type
 * @param {Procedure<V>} $try function that return `Ok` value but could potententially throw
 * @param {Procedure<V>} $catch called with unknown error if `$try` throws. Returns `Err` error
 * @returns {Result<V, E>} `Ok` if `$try` succeeds. `Err` if it throws error
 */
export function FromTryCatch<V, E>($try: () => V, $catch: (error: unknown) => E): Result<V, E>;

/**
 * Converts procedure that could potentially throw into `Result`
 * @constructor
 * @template V inner `Ok` value type
 * @param {Procedure<V>} $try function that return `Ok` value but could potententially throw
 * @returns {Result<V, unknown>} `Ok` if `$try` succeeds. `Err` if it throws error with unknown error
 */
export function FromTryCatch<V>($try: () => V): Result<V, unknown>;

/**
 * @internal
 */
export function FromTryCatch<V, E>(
  $try: () => V,
  $catch?: (error: unknown) => E
): Result<V, unknown> | Result<V, E> {
  try {
    return Ok($try());
  } catch (e) {
    return $catch ? Err($catch(e)) : Err(e);
  }
}

/**
 * Create `Ok` of type `Result<V, never>`
 * @template V inner `Ok` value type
 * @param value inner `Ok` value
 * @returns {Result<V, never>} result
 */
export function OkOf<V>(value: V): Result<V, never> {
  return Ok(value);
}

/**
 * Create `Err` of type `Result<never, E>`
 * @template E inner `Err` error type
 * @param value inner `Err` error
 * @returns {Result<never, E>} result
 */
export function ErrOf<E>(error: E): Result<never, E> {
  return Err(error);
}

/**
 * Checks if provided `Result` is `Ok`
 * @template V inner `Ok` type
 * @param {Result<V, any>} result result to be checked
 * @returns {boolean} `true` if `Ok`. Otherwise `false`
 */
export function isOk<V>(result: Result<V, any>): result is Ok<V>;

/**
 * Checks if thing is `Ok`
 * @param {unknown} thing result to be checked
 * @returns {boolean} `true` if `Ok`. Otherwise `false`
 */
export function isOk(thing: unknown): thing is Ok<unknown>;

/**
 * @internal
 */
export function isOk<V>(resultOrThing: Result<V, any> | unknown): resultOrThing is Ok<V> {
  if (typeof resultOrThing !== "object") return false;
  if (resultOrThing === null) return false;
  if (Object.keys(resultOrThing).length !== 2) return false;
  if (
    !("ok" in resultOrThing && typeof resultOrThing.ok === "boolean") ||
    !("value" in resultOrThing)
  )
    return false;

  return resultOrThing.ok;
}

/**
 * Alias for `isOk`
 * @template V inner `Ok` value type
 * @param {Result<V, any>} result result to be checked
 * @returns {boolean} `true` if `Ok`. Otherwise `false`
 * @see {@link isOk}
 */
export const notErr = isOk;

/**
 * Checks if provided `Result` is `Err`
 * @template E inner `Err` error type
 * @param {Result<any, E>} result result to be checked
 * @returns {boolean} `true` if `Err`. Otherwise `false`
 */
export function isErr<E>(result: Result<any, E>): result is Err<E>;

/**
 * Checks if thing is `Err`
 * @param {unknown} thing to be checked
 * @returns {boolean} `true` if `Err`. Otherwise `false`
 */
export function isErr(thing: unknown): thing is Err<unknown>;

/**
 * @internal
 */
export function isErr<E>(resultOrThing: Result<any, E> | unknown): resultOrThing is Err<E> {
  if (typeof resultOrThing !== "object") return false;
  if (resultOrThing === null) return false;
  if (Object.keys(resultOrThing).length !== 2) return false;
  if (
    !("ok" in resultOrThing && typeof resultOrThing.ok === "boolean") ||
    !("error" in resultOrThing)
  )
    return false;

  return !resultOrThing.ok;
}

/**
 * Alias for `isErr`
 * @template E inner `Err` error type
 * @param {Result<any, E>} result result to be checked
 * @returns {boolean} `true` if `Err`. Otherwise- `false`
 * @see {@link isErr}
 */
export const notOk = isErr;

/**
 * Checks if provided `thing` is of type `Result`
 * @param {unknown} thing data to be checked
 * @returns {boolean} `true` if thing is `Maybe`. Otherwise `false`
 */
export function isResult(thing: unknown): thing is Any {
  return isOk(thing) || isErr(thing);
}

/**
 * Creates an operator that extracts the `Ok` value from a `Result`, or throws `TakeError` if it is `Err`.
 * @template V The type of the `Ok` value.
 * @returns An operator that either returns the `Ok` value or throws an error.
 * @throws {Error} if the result is not an `Ok`.
 * @see {@link or}
 */
export function unwrap<V>(): Operator<Result<V, any>, V> {
  return result =>
    isOk(result) ? result.value : panic(new Error("unwrap failed. Result is `Err`"));
}

/**
 * Creates an operator that applies a function to the `Ok` value of a `Result`, if present.
 * @template V The type of the `Ok` value.
 * @template E The type of the `Err` error.
 * @param {Operator<V, any>} f A function to apply to the `Ok` value.
 * @returns An operator that returns the same `Result`.
 */
export function peek<V, E>(f: (ok: V) => any): Operator<Result<V, E>, Result<V, E>> {
  return result => {
    if (isOk(result)) f(result.value);
    return result;
  };
}

/**
 * Creates an operator that applies a function to the `Err` value of a `Result`, if present.
 * @template V The type of the `Ok` value.
 * @template E The type of the `Err` error.
 * @param f A function to apply to the `Err` value.
 * @returns An operator that returns the same `Result`.
 */
export function peekErr<V, E>(f: (err: E) => any): Operator<Result<V, E>, Result<V, E>> {
  return result => {
    if (isErr(result)) f(result.error);
    return result;
  };
}

/**
 * Creates an operator that transforms the `Ok` value of a `Result` using a provided mapping function, or returns the same `Err`.
 * @template V The type of the `Ok` value before the transformation.
 * @template To The type of the `Ok` value after the transformation.
 * @template E The type of the `Err` error.
 * @param {Mapper<V, To>} mapper A function to transform the `Ok` value.
 * @returns An operator that returns a new `Result` with the transformed `Ok` value or the same `Err`.
 */
export function map<V, E, To>(mapper: Mapper<V, To>): Operator<Result<V, E>, Result<To, E>> {
  return result => (isOk(result) ? Ok(mapper(result.value)) : result);
}

/**
 * Creates an operator that transforms the `Err` value of a `Result` using a provided mapping function, or returns the unchanged `Ok`.
 * @template V The type of the `Ok` value.
 * @template E The original error type.
 * @template To The new error type.
 * @param {Mapper<E, To>} mapper A function to transform the error.
 * @returns An operator that returns a new `Result` with the transformed error or the unchanged `Ok`.
 */
export function mapErr<V, E, To>(
  mapper: (error: E) => To
): Operator<Result<V, E>, Result<V, To>> {
  return result => (isErr(result) ? Err(mapper(result.error)) : result);
}

/**
 * Creates an operator that returns an alternative value or executes a function if the input `Result` is an instance of `Err`.
 * @template V The type of the `Ok` value.
 * @template E The type of the `Err` error.
 * @param {Mapper<E, V>} f A function that receives an `Err` error and returns an alternative value.
 * @returns An operator that returns either the `Ok` value or an alternative value.
 */
export function or<V, E>(f: (error: E) => V): Operator<Result<V, E>, V>;

/**
 * Creates an operator that returns a specified value if the input `Result` is an instance of `Err`.
 * @template V The type of the `Ok` value.
 * @param {V} value The alternative value to return.
 * @returns An operator that returns either the `Ok` value or the specified alternative value.
 */
export function or<V>(value: V): Operator<Result<V, any>, V>;

/**
 * @internal
 */
export function or<V, E>(fnOrValue: ((error: E) => V) | V): Operator<Result<V, E>, V> {
  return result =>
    isOk(result) ? result.value : isFunction(fnOrValue) ? fnOrValue(result.error) : fnOrValue;
}

/**
 * Turns a nested Result into a result of depth 1. This is for the Ok channel only. Input result should never exceed a depth of `MAX_UNFOLD_DEPTH`.
 * @template V inner Ok value type
 * @template E inner Err error type
 * @returns An operator that takes a nested result and returns an unfolded result.
 * @see {@link RESULT_MAX_UNFOLD_DEPTH}
 */
export function unfold<V, E>(): Operator<Result<V, E>, Unfold<Result<V, E>>> {
  return result => {
    if (isErr(result)) return result as Unfold<Result<V, E>>;

    let inner = result.value;

    for (let i = 0; i < MAX_UNFOLD_DEPTH; i++) {
      if (!isResult(inner)) break;
      if (isErr(inner)) return inner as Unfold<Result<V, E>>;
      inner = inner.value;
    }

    return Ok(inner) as Unfold<Result<V, E>>;
  };
}

/**
 * Turns a nested `Result` into a result with 1 less depth. This unnesting occurs for the Ok channel.
 * @template V inner Ok value type
 * @template E inner Err error type
 * @returns An operator that takes a nested result and returns a flattened result.
 */
export function flatten<V, E>(): Operator<Result<V, E>, Flatten<Result<V, E>>> {
  return result => {
    if (isErr(result) || !isResult(result.value) || isErr(result.value))
      return result as Flatten<Result<V, E>>;
    return result.value as Flatten<Result<V, E>>;
  };
}

/**
 * Transforms & unwraps an input `Result`. Used when you'd like to generate an error based on the inner Ok value of the result, if there is one.
 * @template V original Ok value type
 * @template E original Err error type
 * @template ToV mapped Ok value type
 * @template ToE mapped Err error type
 * @param {Mapper<V, Result<ToV, ToE>>} mapper A function that maps the Ok value to a new Result.
 * @returns An operator that takes an original Result and returns a transformed, potentially flattened result.
 * @see {@link map}
 * @see {@link unfold}
 */
export function flatmap<V, E, ToV, ToE>(
  mapper: (ok: V) => Result<ToV, ToE>
): Operator<Result<V, E>, Result<ToV, E | V>> {
  return result => {
    return isOk(result) ? (mapper(result.value) as Result<ToV, E | V>) : result;
  };
}

/**
 * Checks if the `Ok` value of a `Result` meets a specified condition. If the condition is met, the original `Result` is returned. If not, it returns an empty `Err`.
 * @template V the type of the Ok value
 * @template E the original error type
 * @param {Predicate<V>} predicate a function that checks the Ok value against a condition
 * @returns {Operator<Result<V, E>, Result<V, E | Nothing>>} an operator that returns the original Result if the check passes, or an empty Err
 */
export function check<V, E>(
  predicate: Predicate<V>
): Operator<Result<V, E>, Result<V, E | Nothing>>;

export function check<V, E>(
  predicate: Predicate<V>
): Operator<Result<V, E>, Result<V, E | Nothing>>;

/**
 * Checks if the `Ok` value of a `Result` meets a specified condition. If the condition is met, the original `Result` is returned. If not, it returns an `Err` with a new error.
 * @template V The type of the `Ok` value.
 * @template E The original error type.
 * @template FailE The type of the new error when the check fails.
 * @param {Predicate<V>} predicate A function that checks the `Ok` value against a condition.
 * @param {FailE} fail The error to return if the check fails.
 * @returns An operator that returns the original `Result` if the check passes, or a new `Err` with the `failError`.
 */
export function check<V, E, FailE>(
  predicate: Predicate<V>,
  fail: FailE | Nullary<FailE>
): Operator<Result<V, E>, Result<V, E | FailE>>;

/** @internal */
export function check<V, E, FailE>(
  predicate: Predicate<V>,
  fail?: FailE | Nullary<FailE>
): Operator<Result<V, E>, Result<V, E | FailE | Nothing>> {
  return result =>
    isOk(result)
      ? predicate(result.value)
        ? result
        : fail
          ? Err(evaluate(fail))
          : Err()
      : result;
}

/**
 * Converts a `Result` into a `Maybe`, returning `Some` if `Ok`, or `None` if `Err`.
 * @template V The type of the `Ok` value.
 * @returns {Operator<Result<V, any>, Maybe<V>>} operator to conver types.
 * @see {@link Maybe}
 */
export function toMaybe<V>(): Operator<Result<V, any>, Maybe<V>> {
  return result => (result.ok ? Some(result.value) : None());
}
