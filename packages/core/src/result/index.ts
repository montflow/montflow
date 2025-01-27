import * as Function from "../function/index.js";
import * as Macro from "../macro/index.js";
import * as Maybe from "../maybe/index.js";
import * as Nothing from "../nothing/index.js";
import * as Number from "../number/index.js";

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
export type Result<V = Nothing.Nothing, E = Nothing.Nothing> = Ok<V> | Err<E>;

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
      ? Unfold<Result<NestedOk, NestedErr | RootErr>, Number.Decrement<Limit>>
      : Root
    : never;

/**
 * Shorthand for `Promise` of a `Result`
 * @template V inner `Ok` value type. Defaults to `Nothing`
 * @template E inner `Err` error type. Defaults to `Nothing`
 * @returns {Promise<Result<V, E>>}
 */
export type Async<V = Nothing.Nothing, E = Nothing.Nothing> = Promise<Result<V, E>>;

/**
 * Creates empty `Ok`
 * @constructor
 * @returns {Ok<Nothing>} empty `Ok`
 */
export function Ok(): Ok<Nothing.Nothing>;

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
export function Ok<V>(value?: V): Ok<V> | Ok<Nothing.Nothing> {
  return {
    ok: true,
    value: value !== undefined ? value : Nothing.make(),
  } as Ok<V> | Ok<Nothing.Nothing>;
}

/**
 * Creates empty `Err`
 * @constructor
 * @returns {Err<Nothing>} empty `Err`
 */
export function Err(): Err<Nothing.Nothing>;

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
export function Err<E>(error?: E): Err<E> | Err<Nothing.Nothing> {
  return {
    ok: false,
    error: error !== undefined ? error : Nothing.make(),
  } as Err<E> | Err<Nothing.Nothing>;
}

/**
 * Creates `Ok` with type of `Result<Nothing, Nothing>`
 * @constructor
 * @param {"ok"} kind
 * @returns {Result<Nothing, Nothing>} `Result` of type `Ok<Nothing>`
 */
export function Create(kind: "ok"): Result<Nothing.Nothing, Nothing.Nothing>;

/**
 * Creates `Ok` with type of `Result<V, Nothing>`
 * @constructor
 * @template V type of inner `Ok` value
 * @param {"ok"} kind
 * @param {V} value inner `Ok` value
 * @returns {Result<V, Nothing>} `Result` of type `Ok` with inner `value`
 */
export function Create<V>(kind: "ok", value: V): Result<V, Nothing.Nothing>;

/**
 * Creates `Ok` with type of `Result<V, E>`
 * @constructor
 * @template V type of inner `Ok` value
 * @template E type of inner `Err` error
 * @param {"ok"} kind
 * @param {V} value inner `Ok` value
 * @returns {Result<V, E>} `Result` of type `Ok` with inner `value`
 */
export function Create<V = Nothing.Nothing, E = Nothing.Nothing>(
  kind: "ok",
  value: V
): Result<V, E>;

/**
 * Creates `Err` with type of `Result<Nothing, Nothing>`
 * @constructor
 * @param {"err"} kind
 * @returns {Result<Nothing, Nothing>} `Result` of type `Err<Nothing>`
 */
export function Create(kind: "err"): Result<Nothing.Nothing, Nothing.Nothing>;

/**
 * Creates `Err` with type of `Result<Nothing, E>`
 * @constructor
 * @template E type of inner `Err` error
 * @param {"err"} kind
 * @param {E} error inner `Err` error
 * @returns {Result<Nothing, E>} `Result` of type `Err` with inner `error`
 */
export function Create<E>(kind: "err", error: E): Result<Nothing.Nothing, E>;

/**
 * Creates `Err` with type of `Result<V, E>`
 * @constructor
 * @template V type of inner `Ok` value
 * @template E type of inner `Err` error
 * @param {"err"} kind
 * @param {E} error inner `Err` error
 * @returns {Result<V, E>} `Result` of type `Err` with inner `error`
 */
export function Create<V = Nothing.Nothing, E = Nothing.Nothing>(
  kind: "err",
  error: E
): Result<V, E>;

/**
 * @internal
 */
export function Create<ValueOrError, Error>(
  kind: "ok" | "err",
  valueOrError?: ValueOrError | Error
):
  | Result<Nothing.Nothing, Nothing.Nothing>
  | Result<ValueOrError, Nothing.Nothing>
  | Result<Nothing.Nothing, ValueOrError>
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

export const make = Create;

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

export const unwrap: {
  <V>(): (self: Result<V, any>) => V;
  <V>(self: Result<V, any>): V;
} = Macro.dualify(0, <V>(self: Result<V, any>) =>
  isOk(self) ? self.value : Macro.panic(new Error("unwrap failed. Result is `Err`"))
);

export const peek: {
  <V, E>(fn: (ok: V) => any): (self: Result<V, E>) => Result<V, E>;
  <V, E>(self: Result<V, E>, fn: (ok: V) => any): Result<V, E>;
} = Macro.dualify(1, <V, E>(self: Result<V, E>, fn: (ok: V) => any) => {
  if (isOk(self)) fn(self.value);
  return self;
});

export const peekErr: {
  <V, E>(fn: (err: E) => any): (self: Result<V, E>) => Result<V, E>;
  <V, E>(self: Result<V, E>, fn: (err: E) => any): Result<V, E>;
} = Macro.dualify(1, <V, E>(self: Result<V, E>, fn: (err: E) => any) => {
  if (isErr(self)) fn(self.error);
  return self;
});

export const map: {
  <V, E, To>(mapper: Function.Mapper<V, To>): (self: Result<V, E>) => Result<To, E>;
  <V, E, To>(self: Result<V, E>, mapper: Function.Mapper<V, To>): Result<To, E>;
} = Macro.dualify(1, <V, E, To>(self: Result<V, E>, mapper: Function.Mapper<V, To>) =>
  isOk(self) ? Ok(mapper(self.value)) : self
);

export const mapErr: {
  <V, E, To>(mapper: (error: E) => To): (self: Result<V, E>) => Result<V, To>;
  <V, E, To>(self: Result<V, E>, mapper: (error: E) => To): Result<V, To>;
} = Macro.dualify(1, <V, E, To>(self: Result<V, E>, mapper: (error: E) => To) =>
  isErr(self) ? Err(mapper(self.error)) : self
);

export const or: {
  <V, E>(fn: (error: E) => V): (self: Result<V, E>) => V;
  <V, E>(self: Result<V, E>, fn: (error: E) => V): V;
  <V>(value: V): (self: Result<V, any>) => V;
  <V>(self: Result<V, any>, value: V): V;
} = Macro.dualify(1, <V, E>(self: Result<V, E>, fnOrValue: ((error: E) => V) | V) =>
  isOk(self) ? self.value : Function.isFunction(fnOrValue) ? fnOrValue(self.error) : fnOrValue
);

export const unfold: {
  <V, E>(): (self: Result<V, E>) => Unfold<Result<V, E>>;
  <V, E>(self: Result<V, E>): Unfold<Result<V, E>>;
} = Macro.dualify(0, <V, E>(self: Result<V, E>) => {
  if (isErr(self)) return self as Unfold<Result<V, E>>;
  let inner = self.value;

  for (let i = 0; i < MAX_UNFOLD_DEPTH; i++) {
    if (!isResult(inner)) break;
    if (isErr(inner)) return inner as Unfold<Result<V, E>>;
    inner = inner.value;
  }

  return Ok(inner) as Unfold<Result<V, E>>;
});

export const flatten: {
  <V, E>(): (self: Result<V, E>) => Flatten<Result<V, E>>;
  <V, E>(self: Result<V, E>): Flatten<Result<V, E>>;
} = Macro.dualify(0, <V, E>(self: Result<V, E>) => {
  if (isErr(self) || !isResult(self.value) || isErr(self.value))
    return self as Flatten<Result<V, E>>;
  return self.value as Flatten<Result<V, E>>;
});

export const flatmap: {
  <V, E, ToV, ToE>(
    mapper: (ok: V) => Result<ToV, ToE>
  ): (self: Result<V, E>) => Result<ToV, E | ToE>;
  <V, E, ToV, ToE>(
    self: Result<V, E>,
    mapper: (ok: V) => Result<ToV, ToE>
  ): Result<ToV, E | ToE>;
} = Macro.dualify(
  1,
  <V, E, ToV, ToE>(self: Result<V, E>, mapper: (ok: V) => Result<ToV, ToE>) =>
    isOk(self) ? (mapper(self.value) as Result<ToV, E | ToE>) : self
);

export const check: {
  <V, E>(
    predicate: Function.Predicate<V>
  ): (self: Result<V, E>) => Result<V, E | Nothing.Nothing>;
  <V, E>(self: Result<V, E>, predicate: Function.Predicate<V>): Result<V, E | Nothing.Nothing>;
  <V, E, FailE>(
    predicate: Function.Predicate<V>,
    fail: FailE | Function.Nullary<FailE>
  ): (self: Result<V, E>) => Result<V, E | FailE>;
  <V, E, FailE>(
    self: Result<V, E>,
    predicate: Function.Predicate<V>,
    fail: FailE | Function.Nullary<FailE>
  ): Result<V, E | FailE>;
} = Macro.dualify(
  2,
  <V, E, FailE>(
    self: Result<V, E>,
    predicate: Function.Predicate<V>,
    fail?: FailE | Function.Nullary<FailE>
  ) =>
    isOk(self)
      ? predicate(self.value)
        ? self
        : fail
          ? Err(Macro.evaluate(fail))
          : Err()
      : self
);

export const toMaybe: {
  <V>(): (self: Result<V, any>) => Maybe.Maybe<V>;
  <V>(self: Result<V, any>): Maybe.Maybe<V>;
} = Macro.dualify(0, <V>(self: Result<V, any>) =>
  isOk(self) ? Maybe.Some(self.value) : Maybe.None()
);
