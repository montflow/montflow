import * as Alias from '../alias/index.js';
import * as Domain from '../domain/index.js';
import * as Function from '../function/index.js';
import * as Macro from '../macro/index.js';
import * as Maybe from '../maybe/index.js';
import * as Numeric from '../numeric/index.js';
import * as Table from '../table/index.js';
import { Evaluable, Sync } from '../global/index.js';

/**
 * Unique domain identifier for the Result algebraic data type.
 */
export const Id = 'result' as const;

/**
 * Type of the unique domain identifier for the Result algebraic data type.
 */
export type Id = typeof Id;

/**
 * Tag used to discriminate the `Ok` variant at runtime.
 *
 * @todo testing
 */
export const OkTag = 'ok' as const;

/**
 * Type of the `Ok` discriminant tag.
 */
export type OkTag = typeof OkTag;

/**
 * Represents the successful outcome of an operation.
 *
 * @template V Type of inner value
 */
export type Ok<out V> = {
  readonly [Domain.Id]: Id;
  readonly [Domain.Tag]: OkTag;
  readonly value: V;
};

/**
 * Tag used to discriminate the `Err` variant at runtime.
 *
 * @todo testing
 */
export const ErrTag = 'err' as const;

/**
 * Type of the `Err` discriminant tag.
 */
export type ErrTag = typeof ErrTag;

/**
 * Represents the unsuccessful outcome of an operation.
 *
 * @template E Type of inner error
 */
export type Err<out E> = {
  readonly [Domain.Id]: Id;
  readonly [Domain.Tag]: ErrTag;
  readonly error: E;
};

/**
 * Maximum depth for `unfold` to prevent infinite recursion with cyclic or
 * deeply nested structures.
 */
export const MAX_UNFOLD_DEPTH = 512;

/**
 * A Result value that is either `Ok<V>` (success) or `Err<E>` (error).
 *
 * @template V Value type in the `Ok` branch
 * @template E Error type in the `Err` branch
 */
export type Result<V = never, E = never> = Ok<V> | Err<E>;

/**
 * Alias for a `Result<any, any>` value.
 */
export type Any = Result<any, any>;

/**
 * Alias for a `Result<never, never>` value.
 */
export type Never = Result<never, never>;

/**
 * Alias for a `Result<unknown, unknown>` value.
 */
export type Unknown = Result<unknown, unknown>;

/**
 * Extracts the inner `Ok` value type
 *
 * @template TResult input `Result` type
 * @returns inner `Ok` value type
 */
export type Value<TResult extends Any> = TResult extends Ok<infer V> ? V : never;

/**
 * Extracts the inner `Err` type
 *
 * @template TResult any `Result`
 * @returns inner `Err` type
 */
export type Error<TResult extends Any> = TResult extends Err<infer E> ? E : never;

/**
 * Unwraps nested `Result` type once
 *
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
 *
 * @template Root `Result` type to unfold
 * @returns `Result` of depth 1. All `Err`'s are combined onto single union `Err`
 * @see {@link Result.Flatten}
 * @see {@link Result.Unfold}
 *
 * @todo testing
 */
export type InfiniteUnfold<Root extends Any> = [Root] extends [Result<infer RootOk, infer RootErr>]
  ? [RootOk] extends [Result<infer NestedOk, infer NestedErr>]
    ? InfiniteUnfold<Result<NestedOk, NestedErr | RootErr>>
    : Root
  : never;

/**
 * Recursively flattens nested `Result` type up to `Limit`. For an **infinite** version checkout `Result.InfiniteUnfold` or simpler `Result.Flatten`
 *
 * @template Root `Result` type to unfold
 * @returns `Result` of depth 1 if depth ≤ `Limit`. Otherwise the unfolded result up to `Limit`
 * @see {@link Result.InfiniteUnfold}
 * @see {@link Result.Flatten}
 *
 * @todo testing
 */
export type Unfold<
  Root extends Any,
  Limit extends number = typeof MAX_UNFOLD_DEPTH,
> = Limit extends 0
  ? Root
  : [Root] extends [Result<infer RootOk, infer RootErr>]
    ? [RootOk] extends [Result<infer NestedOk, infer NestedErr>]
      ? Unfold<Result<NestedOk, NestedErr | RootErr>, Numeric.Decrement<Limit>>
      : Root
    : never;

/**
 * Shorthand for a `Promise` that resolves to a `Result<V, E>`.
 *
 * @template V Inner `Ok` value type
 * @template E Inner `Err` error type
 * @returns A promise of a `Result<V, E>`
 */
export type Promise<V, E> = Alias.Promise<Result<V, E>>;

/**
 * @constructor
 *
 * Constructs an `Ok` value, wrapping a successful result.
 *
 * @template V Value type
 * @param value The value to wrap
 * @returns An `Ok<V>`
 *
 * @todo testing
 */
export const ok: {
  (): Ok<never>;
  <V>(value: V): Ok<V>;
} = Macro.cast(<V = never>(value?: V): Ok<V | never> => ({
  [Domain.Id]: Id,
  [Domain.Tag]: OkTag,
  value: value === Macro.undefined ? Macro.never : value,
}));

/**
 * @constructor
 *
 * Constructs an `Err` value, wrapping an error result.
 *
 * @template E Error type
 * @param error The error to wrap
 * @returns An `Err<E>`
 *
 * @todo testing
 */
export const err: {
  (): Err<never>;
  <E>(error: E): Err<E>;
} = Macro.cast(<E = never>(error: E): Err<E | never> => ({
  [Domain.Id]: Id,
  [Domain.Tag]: ErrTag,
  error: error === Macro.undefined ? Macro.never : error,
}));

/**
 * Executes a function and captures exceptions as `Err`.
 * Returns `Ok<V>` if the function succeeds, otherwise `Err<E>`.
 *
 * @template V Return type of the function
 * @template E Error type (defaults to `unknown`)
 * @param $try Function to execute or branches object with try/catch handlers
 * @returns `Result<V, E>`
 *
 * @todo testing
 */
const _try: {
  <V>($try: Sync<V>): Result<V, unknown>;
  <V, E>(branches: { try: () => V; catch: (error: unknown) => E }): Result<V, E>;
} = Macro.cast(
  <V, E = unknown>(
    $tryOrBranches: Sync<V> | { try: Sync<V>; catch: (error: unknown) => E },
  ): Result<V, E> => {
    if (Function.isFunction($tryOrBranches)) {
      const fn = $tryOrBranches;

      try {
        return ok(fn());
      } catch (error) {
        // SAFETY: this helper's contract is that the wrapped function throws
        // errors of type E, so the caught value is E.
        return err(error as E);
      }
    }

    const branches = $tryOrBranches;

    try {
      return ok(branches.try());
    } catch (error) {
      return err(branches.catch(error));
    }
  },
);

export { _try as try };

/**
 * Returns `true` if the given value is an `Ok` variant.
 *
 * @template V Value type
 * @param thing Unknown value or result to test
 * @returns Type guard for `Ok<V>`
 *
 * @todo testing
 */
export const isOk: {
  <V>(result: Result<V, any>): result is Ok<V>;
  (thing: unknown): thing is Ok<unknown>;
} = (thing: unknown): thing is Ok<unknown> =>
  Table.isObject(thing) &&
  Table.hasKeys(thing, [Domain.Id, Domain.Tag, 'value']) &&
  Table.size(thing) === 3 &&
  thing[Domain.Id] === Id &&
  thing[Domain.Tag] === OkTag;

/**
 * Returns `true` if the given value is an `Err` variant.
 *
 * @template E Error type
 * @param thing Unknown value or result to test
 * @returns Type guard for `Err<E>`
 *
 * @todo testing
 */
export const isErr: {
  <E>(result: Result<any, E>): result is Err<E>;
  (thing: unknown): thing is Err<unknown>;
} = (thing: unknown): thing is Err<unknown> =>
  Table.isObject(thing) &&
  Table.hasKeys(thing, [Domain.Id, Domain.Tag, 'error']) &&
  Table.size(thing) === 3 &&
  thing[Domain.Id] === Id &&
  thing[Domain.Tag] === ErrTag;

/**
 * Returns `true` if the given value is a `Result` (`Ok` or `Err`).
 *
 * @param thing Unknown value to test
 * @returns Type guard for `Result<unknown, unknown>`
 *
 * @todo testing
 */
export const isResult = (thing: unknown): thing is Result<unknown, unknown> =>
  isErr(thing) || isOk(thing);

/**
 * Error thrown when attempting to `unwrap` an `Err` value.
 *
 * @todo testing
 */
export class UnwrapError extends Error {
  constructor() {
    super(`Result is "Err". Unwrap operation failed`);
  }
}

/**
 * Extracts the inner value from `Ok`, or throws `UnwrapError` for `Err`.
 *
 * @template V Value type
 * @param self The `Result<V, any>` to unwrap
 * @returns The inner value when `Ok`
 * @throws {UnwrapError} If `self` is `Err`
 *
 * @todo testing
 */
export const unwrap = <V>(self: Result<V, any>): V =>
  isOk(self) ? self.value : Macro.panic(new UnwrapError());

/**
 * Runs provided tapper function if `Ok` with value. Otherwise it's skipped.
 *
 * @template V Value type
 * @template E Error type
 * @param tapper Function to run if `Ok` with value
 * @returns The original `Result<V, E>`
 *
 * @todo testing
 */
export const tap: {
  <V, E>(fn: Function.Tapper<V>): (self: Result<V, E>) => Result<V, E>;
  <V, E>(self: Result<V, E>, fn: Function.Tapper<V>): Result<V, E>;
} = Macro.dualify(1, <V, E>(self: Result<V, E>, fn: Function.Tapper<V>) => {
  if (isOk(self)) fn(self.value);
  return self;
});

/**
 * Runs provided tapper function if `Err` with error. Otherwise it's skipped.
 *
 * @template V Value type
 * @template E Error type
 * @param tapper Function to run if `Err` with error
 * @returns The original `Result<V, E>`
 *
 * @todo testing
 */
export const tapErr: {
  <V, E>(fn: Function.Tapper<E>): (self: Result<V, E>) => Result<V, E>;
  <V, E>(self: Result<V, E>, fn: Function.Tapper<E>): Result<V, E>;
} = Macro.dualify(1, <V, E>(self: Result<V, E>, fn: Function.Tapper<E>) => {
  if (isErr(self)) fn(self.error);
  return self;
});

/**
 * Transforms the inner value with `mapper` when `Ok`; returns `Err` unchanged otherwise.
 *
 * @template V Input value type
 * @template E Error type
 * @template TTo Output value type
 * @param mapper Function applied to the `Ok` value
 * @returns A function expecting a `Result<V, E>` and returning `Result<TTo, E>`
 *
 * @todo testing
 */
export const map: {
  <V, E, TTo>(mapper: Function.Mapper<V, TTo>): (self: Result<V, E>) => Result<TTo, E>;
  <V, E, TTo>(self: Result<V, E>, mapper: Function.Mapper<V, TTo>): Result<TTo, E>;
} = Macro.dualify(1, <V, E, TTo>(self: Result<V, E>, mapper: Function.Mapper<V, TTo>) =>
  isOk(self) ? ok(mapper(self.value)) : self,
);

/**
 * Transforms the inner error with `mapper` when `Err`; returns `Ok` unchanged otherwise.
 *
 * @template V Value type
 * @template E Input error type
 * @template TTo Output error type
 * @param mapper Function applied to the `Err` error
 * @returns A function expecting a `Result<V, E>` and returning `Result<V, TTo>`
 *
 * @todo testing
 */
export const mapErr: {
  <V, E, TTo>(mapper: (error: E) => TTo): (self: Result<V, E>) => Result<V, TTo>;
  <V, E, TTo>(self: Result<V, E>, mapper: (error: E) => TTo): Result<V, TTo>;
} = Macro.dualify(1, <V, E, TTo>(self: Result<V, E>, mapper: (error: E) => TTo) =>
  isErr(self) ? err(mapper(self.error)) : self,
);

/**
 * When `Ok`, returns the original value, otherwise returns the provided fallback value or result of fallback function.
 *
 * @template V Value type
 * @template E Error type
 * @param fnOrValue Fallback value or function that takes error and returns value
 * @returns The inner value when `Ok`, or the fallback when `Err`
 *
 * @todo testing
 */
export const orElse: {
  <V, E>(fn: (error: E) => V): (self: Result<V, E>) => V;
  <V, E>(self: Result<V, E>, fn: (error: E) => V): V;
  <V>(value: V): (self: Result<V, any>) => V;
  <V>(self: Result<V, any>, value: V): V;
} = Macro.dualify(1, <V, E>(self: Result<V, E>, fnOrValue: ((error: E) => V) | V) =>
  isOk(self) ? self.value : Function.isFunction(fnOrValue) ? fnOrValue(self.error) : fnOrValue,
);

/**
 * Fully unfolds nested `Result` values until a non-`Result` is reached or
 * until `MAX_UNFOLD_DEPTH` is hit.
 *
 * @template V Value type
 * @template E Error type
 * @param self Possibly nested `Result`
 * @returns `Err` if any level is `Err`, otherwise `Ok<Innermost>`
 *
 * @see {@link MAX_UNFOLD_DEPTH}
 *
 * @todo testing
 */
export const unfold: {
  <V, E>(): (self: Result<V, E>) => Unfold<Result<V, E>>;
  <V, E>(self: Result<V, E>): Unfold<Result<V, E>>;
} = Macro.dualify(0, <V, E>(self: Result<V, E>) => {
  if (isErr(self)) {
    // SAFETY: an Err is its own unfold — there is nothing nested to unwrap.
    return self as Unfold<Result<V, E>>;
  }
  let inner = self.value;

  for (let i = 0; i < MAX_UNFOLD_DEPTH; i++) {
    if (!isResult(inner)) break;
    if (isErr(inner)) {
      // SAFETY: an Err is its own unfold — nothing nested remains.
      return inner as Unfold<Result<V, E>>;
    }
    // SAFETY: inner is an Ok (isResult passed, isErr returned early), so
    // inner.value is V.
    inner = inner.value as V;
  }

  // SAFETY: at loop exit inner is a Result<V, E> (non-Result values broke
  // out), so ok(inner) re-wraps it at the unfold boundary.
  return ok(inner) as Unfold<Result<V, E>>;
});

/**
 * Flattens exactly one level from nested `Result`.
 *
 * @template V Value type
 * @template E Error type
 * @param self A `Result` possibly containing another `Result`
 * @returns Flattened `Result`
 *
 * @todo testing
 */
export const flatten: {
  <V, E>(): (self: Result<V, E>) => Flatten<Result<V, E>>;
  <V, E>(self: Result<V, E>): Flatten<Result<V, E>>;
} = Macro.dualify(0, <V, E>(self: Result<V, E>) => {
  if (isErr(self) || !isResult(self.value) || isErr(self.value)) {
    // SAFETY: none of the nested-result cases apply, so self is already flat.
    return self as Flatten<Result<V, E>>;
  }
  // SAFETY: self is an Ok holding an Ok<Result<V, E>>, so self.value is the
  // single nested level to unwrap.
  return self.value as Flatten<Result<V, E>>;
});

/**
 * Maps and flattens given `Result` using the provided mapper.
 *
 * @template V Input value type
 * @template E Input error type
 * @template TToV Output value type
 * @template TToE Output error type
 * @param mapper Function mapping `V` to `Result<TToV, TToE>`
 * @returns A function expecting a `Result<V, E>` and returning `Result<TToV, E | TToE>`
 *
 * @see {@link map}
 * @see {@link flatten}
 *
 * @todo testing
 */
export const flatmap: {
  <V, E, TToV, TToE>(
    mapper: (ok: V) => Result<TToV, TToE>,
  ): (self: Result<V, E>) => Result<TToV, E | TToE>;
  <V, E, TToV, TToE>(
    self: Result<V, E>,
    mapper: (ok: V) => Result<TToV, TToE>,
  ): Result<TToV, E | TToE>;
} = Macro.dualify(
  1,
  <V, E, TToV, TToE>(self: Result<V, E>, mapper: (ok: V) => Result<TToV, TToE>) =>
    // SAFETY: mapper's Result<TToV, TToE> is a subtype of the widened
    // Result<TToV, E | TToE> the branch signature promises.
    isOk(self) ? (mapper(self.value) as Result<TToV, E | TToE>) : self,
);

/**
 * Flips the `Ok` and `Err` channels of a `Result`.
 * Converts `Ok<V>` to `Err<V>` and `Err<E>` to `Ok<E>`.
 *
 * @template V Value type
 * @template E Error type
 * @param self The `Result<V, E>` to flip
 * @returns The flipped `Result<E, V>`
 *
 * @todo testing
 */
export const flip = <V, E>(self: Result<V, E>): Result<E, V> =>
  isOk(self) ? err(self.value) : ok(self.error);

/**
 * If `Ok` and predicate is true with value returns self (`Ok<V>`), otherwise returns `Err`.
 * When predicate fails, returns `Err` with provided onFail value.
 *
 * @template V Value type
 * @template E Input error type
 * @template TFailE Failure error type
 * @param predicate Predicate applied to the `Ok` value
 * @param onFail Error value or function to use when predicate fails
 * @returns A function that filters a `Result<V, E>`
 *
 * @todo testing
 */
export const filter: {
  <V, E, TFailE>(
    self: Result<V, E>,
    predicate: Function.Predicate<V>,
    onFail: Evaluable<TFailE>,
  ): Result<V, E | TFailE>;

  <V, E, TFailE>(
    predicate: Function.Predicate<V>,
    onFail: Evaluable<TFailE>,
  ): (self: Result<V, E>) => Result<V, E | TFailE>;
} = Macro.dualify(
  2,
  <V, E, TFailE>(
    self: Result<V, E>,
    predicate: Function.Predicate<V>,
    onFail: TFailE | Function.Nullary<TFailE>,
  ): Result<V, E | TFailE> =>
    isOk(self) ? (predicate(self.value) ? self : err(Macro.evaluate(onFail))) : self,
);

/**
 * Converts a `Result<V, E>` into a `Maybe<V>`.
 * - When `Ok`, returns `some(value)`.
 * - When `Err`, returns `none()`.
 *
 * @template V Success value type
 * @param self The `Result<V, any>` to convert
 * @returns `Maybe<V>`
 *
 * @todo testing
 */
export const toMaybe = <V>(self: Result<V, any>): Maybe.Maybe<V> =>
  isOk(self) ? Maybe.some(self.value) : Maybe.none();
