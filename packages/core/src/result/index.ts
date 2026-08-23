import * as Alias from '../alias/index.js';
import * as Async from '../async/index.js';
import * as Domain from '../domain/index.js';
import * as Function from '../function/index.js';
import * as Macro from '../macro/index.js';
import * as Maybe from '../maybe/index.js';
import * as Numeric from '../numeric/index.js';
import * as Table from '../table/index.js';
import { Evaluable, Sync } from '../global/index.js';

/**
 * @description Unique domain identifier for the Result algebraic data type.
 */
export const Id = 'result' as const;

/**
 * @description Type of the unique domain identifier for the Result algebraic data type.
 */
export type Id = typeof Id;

/**
 * @description Tag used to discriminate the `Ok` variant at runtime.
 */
export const OkTag = 'ok' as const;

/**
 * @description Type of the `Ok` discriminant tag.
 */
export type OkTag = typeof OkTag;

/**
 * @description The `Ok` variant carries a successful value of type `V`.
 *
 * @template V Value type carried by the `Ok` variant
 */
export type Ok<out V> = {
  readonly [Domain.Id]: Id;
  readonly [Domain.Tag]: OkTag;
  /** Payload carried by the `Ok` variant. */
  readonly value: V;
};

/**
 * @description Tag used to discriminate the `Err` variant at runtime.
 */
export const ErrTag = 'err' as const;

/**
 * @description Type of the `Err` discriminant tag.
 */
export type ErrTag = typeof ErrTag;

/**
 * @description The `Err` variant carries a failure value of type `E`.
 *
 * @template E Error type carried by the `Err` variant
 */
export type Err<out E> = {
  readonly [Domain.Id]: Id;
  readonly [Domain.Tag]: ErrTag;
  /** Payload carried by the `Err` variant. */
  readonly error: E;
};

/**
 * @description Maximum depth for `unfold` before truncation returns the remainder as-is.
 *
 * @internal
 */
export const MAX_UNFOLD_DEPTH = 512;

/**
 * @description A Result value that is either `Ok<V>` (success) or `Err<E>` (error).
 *
 * @template V Value type in the `Ok` branch
 * @template E Error type in the `Err` branch
 */
export type Result<V = never, E = never> = Ok<V> | Err<E>;

/**
 * @description Alias for a `Result<any, any>` value.
 */
export type Any = Result<any, any>;

/**
 * @description Alias for a `Result<never, never>` value.
 */
export type Never = Result<never, never>;

/**
 * @description Alias for a `Result<unknown, unknown>` value.
 */
export type Unknown = Result<unknown, unknown>;

/**
 * @description Extracts the inner `Ok` value type.
 *
 * @template TResult Input `Result` type
 * @returns The inner `Ok` value type
 */
export type Value<TResult extends Any> = TResult extends Ok<infer V> ? V : never;

/**
 * @description Extracts the inner `Err` type.
 *
 * @template TResult Input `Result` type
 * @returns The inner `Err` type
 */
export type Error<TResult extends Any> = TResult extends Err<infer E> ? E : never;

/**
 * @description Unwraps nested `Result` type once.
 *
 * @template Root Input `Result` type to flatten
 * @returns The `Result` flattened once. Root and nested `Err`s are combined onto a single union `Err` type
 */
export type Flatten<Root extends Any> = [Root] extends [Result<infer RootOk, infer RootErr>]
  ? [RootOk] extends [Result<infer NestedOk, infer NestedErr>]
    ? Result<NestedOk, RootErr | NestedErr>
    : Root
  : never;

/**
 * @description Recursively unwraps nested `Result` type **infinitely**. Not recommended for general use. Try simpler versions like `Flatten` or `Unfold`.
 *
 * @template Root `Result` type to unfold
 * @returns A `Result` of depth 1. All `Err`s are combined onto a single union `Err` type
 * @see {@link Result.Flatten}
 * @see {@link Result.Unfold}
 */
export type InfiniteUnfold<Root extends Any> = [Root] extends [Result<infer RootOk, infer RootErr>]
  ? [RootOk] extends [Result<infer NestedOk, infer NestedErr>]
    ? InfiniteUnfold<Result<NestedOk, NestedErr | RootErr>>
    : Root
  : never;

/**
 * @description Recursively flattens nested `Result` type up to `Limit`. For an **infinite** version see `Result.InfiniteUnfold`, or the simpler `Result.Flatten`.
 *
 * Truncation semantics: if the input is still nested after `Limit` layers, unfolding stops and the remaining (possibly still nested) `Result` is returned as-is.
 *
 * @template Root `Result` type to unfold
 * @template Limit Maximum unfold depth. Defaults to `MAX_UNFOLD_DEPTH`
 * @returns The fully unfolded `Result` if nesting resolves within `Limit` layers; otherwise the `Result` remaining after `Limit` layers are peeled
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
      ? Unfold<Result<NestedOk, NestedErr | RootErr>, Numeric.Decrement<Limit>>
      : Root
    : never;

/**
 * @description Shorthand for a `Promise` that resolves to a `Result<V, E>`.
 *
 * @template V Inner `Ok` value type
 * @template E Inner `Err` error type
 * @returns A promise of a `Result<V, E>`
 */
export type Promise<V, E> = Alias.Promise<Result<V, E>>;

/**
 * @description Constructs an `Ok` value, wrapping a successful result.
 *
 * An explicitly passed `undefined` payload is preserved at runtime and the
 * implementation widens the payload type to `V | undefined`, mirroring
 * `Maybe.some`.
 *
 * @constructor
 * @template V Value type
 * @param value - The value to wrap
 * @returns An `Ok<V>`
 */
export const ok: {
  (): Ok<never>;
  <V>(value: V): Ok<V>;
} = Macro.cast(<V = never>(value?: V): Ok<V | undefined> => ({
  [Domain.Id]: Id,
  [Domain.Tag]: OkTag,
  value: value === Macro.undefined ? Macro.never : value,
}));

/**
 * @description Constructs an `Err` value, wrapping an error payload.
 *
 * An explicitly passed `undefined` error is preserved at runtime and the
 * implementation widens the error type to `E | undefined`, mirroring
 * `Maybe.some`.
 *
 * @constructor
 * @template E Error type
 * @param error - The error to wrap
 * @returns An `Err<E>`
 */
export const err: {
  (): Err<never>;
  <E>(error: E): Err<E>;
} = Macro.cast(<E = never>(error?: E): Err<E | undefined> => ({
  [Domain.Id]: Id,
  [Domain.Tag]: ErrTag,
  error: error === Macro.undefined ? Macro.never : error,
}));

/**
 * @description Executes a function and captures exceptions as `Err`.
 * Returns `Ok<V>` if the function succeeds, otherwise `Err<E>`.
 *
 * @template V Return type of the function
 * @template E Error type (defaults to `unknown`)
 * @param $try - Function to execute or branches object with try/catch handlers
 * @returns `Result<V, E>`
 */
const _try: {
  <V>($try: Sync<V>): Result<V, unknown>;
  <V, E>(branches: { try: () => V; catch: (error: unknown) => E }): Result<V, E>;
} = Macro.cast(
  <V, E = unknown>(
    $tryOrBranches: Sync<V> | { try: Sync<V>; catch: (error: unknown) => E },
  ): Result<V, E> => {
    if (Function.isCallable($tryOrBranches)) {
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
 * @description Executes an async computation and converts it to a promise of a
 * `Result`. Returns `ok(value)` when the computation resolves, otherwise
 * `err(caught)` with the rejection reason.
 *
 * @template V Resolved value type
 * @param $try - Lazy async function or promise to resolve
 * @returns A promise resolving to `Result<V, unknown>`
 */
export const tryPromise: {
  <V>($try: Async.Lazy<V>): Alias.Promise<Result<V, unknown>>;
  <V>($try: Alias.Promise<V>): Alias.Promise<Result<V, unknown>>;
} = async <V>($try: Async.Lazy<V> | Alias.Promise<V>) => {
  try {
    const value = Function.isCallable($try) ? await $try() : await $try;
    return ok(value);
  } catch (error) {
    return err(error);
  }
};

/**
 * @description Returns `true` if the given value is an `Ok` variant.
 *
 * Unlike `Maybe.isSome`, which deliberately exposes only an unknown-payload
 * guard, this guard additionally offers a caller-asserted narrowing form: `V`
 * is trusted, not verified — only the variant shape (Id, tag, key set) is
 * checked at runtime, so a wrong `V` produces unsound narrows.
 *
 * @template V Caller-asserted value type (narrowing overload only)
 * @param result - The `Result<V, any>` to narrow using the caller-asserted `V`
 * @param thing - Unknown value to test under the unknown-payload form
 * @returns Type guard narrowing to `Ok<V>`, or to `Ok<unknown>` for unknown values
 */
export const isOk: {
  <V>(result: Result<V, any>): result is Ok<V>;
  (thing: unknown): thing is Ok<unknown>;
} = (thing: unknown): thing is Ok<unknown> =>
  // NOTE: key *presence* (`'value' in thing`) rather than `Table.hasKeys`, so
  // an explicitly passed `undefined` payload (see `ok(undefined)`) still counts.
  Table.isObject(thing) &&
  Table.size(thing) === 3 &&
  Domain.Id in thing &&
  Domain.Tag in thing &&
  'value' in thing &&
  thing[Domain.Id] === Id &&
  thing[Domain.Tag] === OkTag;

/**
 * @description Returns `true` if the given value is an `Err` variant.
 *
 * Unlike `Maybe.isNone`, which deliberately exposes only an unknown-payload
 * guard, this guard additionally offers a caller-asserted narrowing form: `E`
 * is trusted, not verified — only the variant shape (Id, tag, key set) is
 * checked at runtime, so a wrong `E` produces unsound narrows.
 *
 * @template E Caller-asserted error type (narrowing overload only)
 * @param result - The `Result<any, E>` to narrow using the caller-asserted `E`
 * @param thing - Unknown value to test under the unknown-payload form
 * @returns Type guard narrowing to `Err<E>`, or to `Err<unknown>` for unknown values
 */
export const isErr: {
  <E>(result: Result<any, E>): result is Err<E>;
  (thing: unknown): thing is Err<unknown>;
} = (thing: unknown): thing is Err<unknown> =>
  // NOTE: key *presence* (`'error' in thing`) rather than `Table.hasKeys`, so
  // an explicitly passed `undefined` error (see `err(undefined)`) still counts.
  Table.isObject(thing) &&
  Table.size(thing) === 3 &&
  Domain.Id in thing &&
  Domain.Tag in thing &&
  'error' in thing &&
  thing[Domain.Id] === Id &&
  thing[Domain.Tag] === ErrTag;

/**
 * @description Returns `true` if the given value is a `Result` (`Ok` or `Err`).
 *
 * @param thing - Unknown value to test
 * @returns Type guard for `Result<unknown, unknown>`
 */
export const isResult = (thing: unknown): thing is Result<unknown, unknown> =>
  isErr(thing) || isOk(thing);

/**
 * @description Error thrown when attempting to `unwrap` an `Err` value.
 *
 * Carries the package-wide `Domain.Tag` (`'unwrap-error'`) so instances can be
 * identified structurally, mirroring `Maybe.UnwrapError`.
 */
export class UnwrapError extends Error {
  /** Tag identifying this error under the package-wide `Domain.Tag` convention. */
  [Domain.Tag] = 'unwrap-error';

  /**
   * @description Builds the error message by attempting `JSON.stringify` on the
   * payload, falling back to `String(payload)` when the result is empty or the
   * payload cannot be serialized (e.g. circular structures). A `undefined`
   * payload is omitted from the message entirely.
   *
   * @param payload - The `Err` error payload to embed in the message
   */
  constructor(payload?: unknown) {
    let snippet: string;
    try {
      snippet = JSON.stringify(payload) ?? String(payload);
    } catch {
      snippet = String(payload);
    }

    super(
      `Result is "Err". Unwrap operation failed${payload === undefined ? '' : ` (${snippet})`}`,
    );
  }
}

/**
 * @description Extracts the inner value from `Ok`, or throws `UnwrapError` for `Err`.
 *
 * @template V Value type
 * @param self - The `Result<V, any>` to unwrap
 * @returns The inner value when `Ok`
 * @throws If `self` is `Err`. See {@link UnwrapError}.
 */
export const unwrap = <V>(self: Result<V, any>): V => {
  if (!isOk(self)) throw new UnwrapError(self.error);
  return self.value;
};

/**
 * @description Runs the provided function if `Ok` with value. Otherwise it is skipped.
 *
 * Supports both data-first and curried invocation.
 *
 * @template V Value type
 * @template E Error type
 * @param self - The `Result<V, E>` to tap into (data-first form)
 * @param fn - Function run with the `Ok` value
 * @returns The original `Result<V, E>`, or a function awaiting `self` in curried form
 *
 * @example
 * ```ts
 * tap(ok(1), (v) => console.log(v)); // logs 1, returns Ok(1)
 * tap(err('e'), (v) => console.log(v)); // skipped, returns Err("e")
 * tap((v: number) => console.log(v))(ok(1)); // curried form
 * ```
 */
export const tap: {
  <V, E>(fn: Function.Tapper<V>): (self: Result<V, E>) => Result<V, E>;
  <V, E>(self: Result<V, E>, fn: Function.Tapper<V>): Result<V, E>;
} = Macro.dualify(1, <V, E>(self: Result<V, E>, fn: Function.Tapper<V>) => {
  if (isOk(self)) fn(self.value);
  return self;
});

/**
 * @description Runs the provided function if `Err` with error. Otherwise it is skipped.
 *
 * Supports both data-first and curried invocation.
 *
 * @template V Value type
 * @template E Error type
 * @param self - The `Result<V, E>` to tap into (data-first form)
 * @param fn - Function run with the `Err` error
 * @returns The original `Result<V, E>`, or a function awaiting `self` in curried form
 *
 * @example
 * ```ts
 * tapErr(err('e'), (e) => console.log(e)); // logs "e", returns Err("e")
 * tapErr(ok(1), (e) => console.log(e)); // skipped, returns Ok(1)
 * tapErr((e: string) => console.log(e))(err('e')); // curried form
 * ```
 */
export const tapErr: {
  <V, E>(fn: Function.Tapper<E>): (self: Result<V, E>) => Result<V, E>;
  <V, E>(self: Result<V, E>, fn: Function.Tapper<E>): Result<V, E>;
} = Macro.dualify(1, <V, E>(self: Result<V, E>, fn: Function.Tapper<E>) => {
  if (isErr(self)) fn(self.error);
  return self;
});

/**
 * @description Transforms the inner value with `mapper` when `Ok`; returns `Err` unchanged otherwise.
 *
 * Supports both data-first and curried invocation.
 *
 * @template V Input value type
 * @template E Error type
 * @template TTo Output value type
 * @param self - The `Result<V, E>` to map (data-first form)
 * @param mapper - Function applied to the `Ok` value
 * @returns The mapped `Result<TTo, E>`, or a function awaiting `self` in curried form
 *
 * @example
 * ```ts
 * map(ok(2), (n) => n * 2); // Ok(4)
 * map(err('e'), (n) => n * 2); // Err("e")
 * map((n: number) => n * 2)(ok(2)); // curried form
 * ```
 */
export const map: {
  <V, E, TTo>(mapper: Function.Mapper<V, TTo>): (self: Result<V, E>) => Result<TTo, E>;
  <V, E, TTo>(self: Result<V, E>, mapper: Function.Mapper<V, TTo>): Result<TTo, E>;
} = Macro.dualify(1, <V, E, TTo>(self: Result<V, E>, mapper: Function.Mapper<V, TTo>) =>
  isOk(self) ? ok(mapper(self.value)) : self,
);

/**
 * @description Transforms the inner error with `mapper` when `Err`; returns `Ok` unchanged otherwise.
 *
 * Supports both data-first and curried invocation.
 *
 * @template V Value type
 * @template E Input error type
 * @template TTo Output error type
 * @param self - The `Result<V, E>` to map the error of (data-first form)
 * @param mapper - Function applied to the `Err` error
 * @returns The mapped `Result<V, TTo>`, or a function awaiting `self` in curried form
 *
 * @example
 * ```ts
 * mapErr(err('e'), (e) => e.length); // Err(1)
 * mapErr(ok(1), (e) => e.length); // Ok(1)
 * mapErr((e: string) => e.length)(err('e')); // curried form
 * ```
 */
export const mapErr: {
  <V, E, TTo>(mapper: (error: E) => TTo): (self: Result<V, E>) => Result<V, TTo>;
  <V, E, TTo>(self: Result<V, E>, mapper: (error: E) => TTo): Result<V, TTo>;
} = Macro.dualify(1, <V, E, TTo>(self: Result<V, E>, mapper: (error: E) => TTo) =>
  isErr(self) ? err(mapper(self.error)) : self,
);

/**
 * @description Returns the inner value when `Ok`; otherwise evaluates the provided fallback.
 *
 * Any function argument is treated as a lazy thunk evaluated for its fallback
 * value — it never receives the error and cannot act as a literal
 * function-valued fallback.
 *
 * Supports both data-first and curried invocation.
 *
 * @template V Value type
 * @template E Error type
 * @param self - The `Result<V, E>` to collapse (data-first form)
 * @param onFail - Fallback value or thunk evaluated when `Err`
 * @returns The inner value when `Ok`, otherwise the evaluated fallback; or a function awaiting `self` in curried form
 *
 * @example
 * ```ts
 * orElse(ok(1), 0); // 1
 * orElse(err('e'), 0); // 0
 * orElse(err('e'), () => expensiveFallback()); // thunk, evaluated lazily
 * orElse(0)(err('e')); // curried form
 * ```
 */
export const orElse: {
  <V, E>(onFail: Evaluable<V>): (self: Result<V, E>) => V;
  <V, E>(self: Result<V, E>, onFail: Evaluable<V>): V;
} = Macro.dualify(1, <V, E>(self: Result<V, E>, onFail: Evaluable<V>) =>
  isOk(self) ? self.value : Macro.evaluate(onFail),
);

/**
 * @description Fully unfolds nested `Result` values until a non-`Result` is reached or until `MAX_UNFOLD_DEPTH` layers have been peeled.
 *
 * Truncation semantics: if the value is still nested after `MAX_UNFOLD_DEPTH`
 * layers, unfolding stops and the remaining (possibly still nested) `Result`
 * is returned as-is, mirroring the `Unfold` type.
 *
 * Supports both data-first and curried invocation.
 *
 * @template V Value type
 * @template E Error type
 * @param self - Possibly nested `Result` (data-first form)
 * @returns The unfolded `Result` — `Err` if any level is `Err`, otherwise `Ok<Innermost>` — or the truncated remainder past `MAX_UNFOLD_DEPTH`; a function awaiting `self` in curried form
 *
 * @see {@link MAX_UNFOLD_DEPTH}
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

  for (let depth = 1; depth <= MAX_UNFOLD_DEPTH; depth++) {
    if (!isResult(inner)) {
      // SAFETY: inner is not a Result, so ok(inner) re-wraps it at the unfold
      // boundary.
      return ok(inner) as Unfold<Result<V, E>>;
    }

    if (isErr(inner)) {
      // SAFETY: an Err is its own unfold — nothing nested remains.
      return inner as Unfold<Result<V, E>>;
    }

    if (depth === MAX_UNFOLD_DEPTH) break;

    // SAFETY: inner is an Ok (isResult passed, isErr returned early), so
    // inner.value is V.
    inner = inner.value as V;
  }

  // SAFETY: MAX_UNFOLD_DEPTH layers were peeled and `inner` is still nested;
  // per the documented truncation semantics it is returned as-is instead of
  // being re-wrapped, keeping the runtime peel count equal to the type-level
  // `Limit`.
  return inner as Unfold<Result<V, E>>;
});

/**
 * @description Flattens exactly one level from nested `Result`.
 *
 * Supports both data-first and curried invocation.
 *
 * @template V Value type
 * @template E Error type
 * @param self - A `Result` possibly containing another `Result` (data-first form)
 * @returns The flattened `Result`, or a function awaiting `self` in curried form
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
 * @description Maps and flattens given `Result` using the provided mapper.
 *
 * Supports both data-first and curried invocation.
 *
 * @template V Input value type
 * @template E Input error type
 * @template TToV Output value type
 * @template TToE Output error type
 * @param self - The `Result<V, E>` to map and flatten (data-first form)
 * @param mapper - Function mapping `V` to `Result<TToV, TToE>`
 * @returns The mapped and flattened `Result<TToV, E | TToE>`, or a function awaiting `self` in curried form
 *
 * @see {@link map}
 * @see {@link flatten}
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
 * @description Flips the `Ok` and `Err` channels of a `Result`.
 * Converts `Ok<V>` to `Err<V>` and `Err<E>` to `Ok<E>`.
 *
 * @template V Value type
 * @template E Error type
 * @param self - The `Result<V, E>` to flip
 * @returns The flipped `Result<E, V>`
 */
export const flip = <V, E>(self: Result<V, E>): Result<E, V> =>
  isOk(self) ? err(self.value) : ok(self.error);

/**
 * @description If `Ok` and the predicate is true with the value, returns `self` (`Ok<V>`); otherwise returns `Err` carrying the provided failure error.
 *
 * Supports both data-first and curried invocation.
 *
 * @template V Value type
 * @template E Input error type
 * @template TFailE Failure error type
 * @param self - The `Result<V, E>` to filter (data-first form)
 * @param predicate - Predicate applied to the `Ok` value
 * @param onFail - Failure error value or thunk used when the predicate fails
 * @returns The filtered `Result<V, E | TFailE>`, or a function awaiting `self` in curried form
 *
 * @example
 * ```ts
 * filter(ok(2), (n) => n > 1, 'too small'); // Ok(2)
 * filter(ok(0), (n) => n > 1, 'too small'); // Err("too small")
 * filter(ok(0), (n) => n > 1, () => 'too small'); // thunk onFail
 * filter((n: number) => n > 1, 'too small')(ok(2)); // curried form
 * ```
 */
export const filter: {
  <V, E, TFailE>(
    predicate: Function.Predicate<V>,
    onFail: Evaluable<TFailE>,
  ): (self: Result<V, E>) => Result<V, E | TFailE>;
  <V, E, TFailE>(
    self: Result<V, E>,
    predicate: Function.Predicate<V>,
    onFail: Evaluable<TFailE>,
  ): Result<V, E | TFailE>;
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
 * @description Converts a `Result<V, E>` into a `Maybe<V>`.
 * - When `Ok`, returns `some(value)`.
 * - When `Err`, returns `none()`.
 *
 * @template V Success value type
 * @param self - The `Result<V, any>` to convert
 * @returns `Maybe<V>`
 */
export const toMaybe = <V>(self: Result<V, any>): Maybe.Maybe<V> =>
  isOk(self) ? Maybe.some(self.value) : Maybe.none();
