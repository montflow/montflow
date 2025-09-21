import { Schema as S } from "effect";

import * as Alias from "../alias/index.js";
import * as Function from "../function/index.js";
import * as Macro from "../macro/index.js";
import * as Maybe from "../maybe/index.js";
import * as Number from "../number/index.js";

/**
 * @todo documentation
 * @todo testing
 */
export const OkId = "ok" as const;

/**
 * @todo documentation
 */
export type OkId = typeof OkId;

/**
 * Represents the successful outcome of operation
 * @template V type of inner value
 */
export type Ok<out V> = {
  readonly _id: OkId;
  readonly value: V;
};

/**
 * @todo documentation
 * @todo testing
 */
export const ErrId = "err" as const;

/**
 * @todo documentation
 */
export type ErrId = typeof ErrId;

/**
 * Represents the unsuccessful outcome of operation
 * @template E type of inner error
 */
export type Err<out E> = {
  readonly _id: ErrId;
  readonly error: E;
};

/**
 * @todo documentation
 */
export const OkSchema = <TInner = unknown>(schema?: S.Schema<TInner>) =>
  S.Struct({ _id: S.Literal(OkId), value: schema ?? S.Unknown }).pipe(S.asSchema);

/**
 * @todo documentation
 */
export const ErrSchema = <TInner = unknown>(schema?: S.Schema<TInner>) =>
  S.Struct({ _id: S.Literal(ErrId), error: schema ?? S.Unknown }).pipe(S.asSchema);

/**
 * @internal
 * @todo documentation
 */
export const MAX_UNFOLD_DEPTH = 512;

/**
 * Either `Ok<V>` or `Err<E>`
 * @template V type of some's inner value
 */
export type Result<V = never, E = never> = Ok<V> | Err<E>;

/**
 * @todo documentation
 */
export const Schema = <TValue = unknown, TError = unknown>(
  valueSchema?: S.Schema<TValue>,
  errorSchema?: S.Schema<TError>
) => S.Union(OkSchema(valueSchema), ErrSchema(errorSchema)).pipe(S.asSchema);

/**
 * Generic `Result` type. Extends `any` other result
 */
export type Any = Result<any, any>;

export type Never = Result<never, never>;

export type Unknown = Result<unknown, unknown>;

/**
 * Extracts the inner `Ok` value type
 * @template TResult input `Result` type
 * @returns inner `Ok` value type
 */
export type Value<TResult extends Any> = TResult extends Ok<infer V> ? V : never;

/**
 * Extracts the inner `Err` type
 * @template TResult any `Result`
 * @returns inner `Err` type
 */
export type Error<TResult extends Any> = TResult extends Err<infer E> ? E : never;

/**
 * Unwraps nested `Result` type once
 * @template Root input `Result` type to flatten
 * @returns `Result` flattened once. Root and nested `Err`s are combined (union) for resulting `Err` type
 */
export type Flatten<Root extends Any> =
  [Root] extends [Result<infer RootOk, infer RootErr>] ?
    [RootOk] extends [Result<infer NestedOk, infer NestedErr>] ?
      Result<NestedOk, RootErr | NestedErr>
    : Root
  : never;

/**
 * Recursively unwraps nested `Result` type **infinitely**. Not recommended for general use. Try simpler versions like `Flatten` or `Unfold`
 * @template Root `Result` type to unfold
 * @returns `Result` of depth 1. All `Err`'s are combined onto single union `Err`
 * @see {@link Result.Flatten}
 * @see {@link Result.Unfold}
 *
 * @todo testing
 */
export type InfiniteUnfold<Root extends Any> =
  [Root] extends [Result<infer RootOk, infer RootErr>] ?
    [RootOk] extends [Result<infer NestedOk, infer NestedErr>] ?
      InfiniteUnfold<Result<NestedOk, NestedErr | RootErr>>
    : Root
  : never;

/**
 * Recursively flattens nested `Result` type up to `Limit`. For an **infinite** version checkout `Result.InfiniteUnfold` or simpler `Result.Flatten`
 * @template Root `Result` type to unfold
 * @returns `Result` of depth 1 if depth ≤ `Limit`. Otherwise the unfolded result up to `Limit`
 * @see {@link Result.InfiniteUnfold}
 * @see {@link Result.Flatten}
 *
 * @todo testing
 */
export type Unfold<Root extends Any, Limit extends number = typeof MAX_UNFOLD_DEPTH> =
  Limit extends 0 ? Root
  : [Root] extends [Result<infer RootOk, infer RootErr>] ?
    [RootOk] extends [Result<infer NestedOk, infer NestedErr>] ?
      Unfold<Result<NestedOk, NestedErr | RootErr>, Number.Decrement<Limit>>
    : Root
  : never;

export type Promise<V, E> = Alias.Promise<Result<V, E>>;

/**
 * @constructor
 *
 * @todo documentation
 * @todo testing
 */
export const ok: {
  (): Ok<never>;
  <V>(value: V): Ok<V>;
} = Macro.cast(
  <V = never>(value: V): Ok<V> => ({
    _id: OkId,
    value: value,
  })
);

/**
 * @constructor
 *
 * @todo documentation
 * @todo testing
 */
export const err: {
  (): Err<never>;
  <E>(error: E): Err<E>;
} = Macro.cast(
  <E = never>(error: E): Err<E> => ({
    _id: ErrId,
    error: error,
  })
);

/**
 * @todo documentation
 * @todo testing
 */
export const _try: {
  <V>($try: () => V): Result<V, unknown>;
  <V, E>(options: { try: () => V; catch: (error: unknown) => E }): Result<V, E>;
} = Macro.todoImpl;

export { _try as try };

/**
 * @todo documentation
 * @todo testing
 */
export const isOk: {
  <V>(result: Result<V, any>): result is Ok<V>;
  (thing: unknown): thing is Ok<unknown>;
} = (thing: unknown): thing is Ok<unknown> => Macro.todoImpl();

/**
 * @todo documentation
 * @todo testing
 */
export const isErr: {
  <E>(result: Result<any, E>): result is Err<E>;
  (thing: unknown): thing is Err<unknown>;
} = (thing: unknown): thing is Err<unknown> => Macro.todoImpl();

/**
 * @todo documentation
 * @todo testing
 */
export const isResult: {
  (thing: unknown): thing is Result<any, any>;
} = (thing: unknown): thing is Result<any, any> => Macro.todoImpl();

/**
 * @todo documentation
 * @todo testing
 */
export class UnwrapError extends Error {
  constructor() {
    super(`Result is "Err". Unwrap operation failed`);
  }
}

/**
 * @todo documentation
 * @todo testing
 */
export const unwrap: {
  <V>(): (self: Result<V, any>) => V;
  <V>(self: Result<V, any>): V;
} = Macro.dualify(0, <V>(self: Result<V, any>) =>
  isOk(self) ? self.value : Macro.panic(new UnwrapError())
);

/**
 * @todo documentation
 * @todo testing
 */
export const peek: {
  <V, E>(fn: (ok: V) => any): (self: Result<V, E>) => Result<V, E>;
  <V, E>(self: Result<V, E>, fn: (ok: V) => any): Result<V, E>;
} = Macro.dualify(1, <V, E>(self: Result<V, E>, fn: (ok: V) => any) => {
  if (isOk(self)) fn(self.value);
  return self;
});

/**
 * @todo documentation
 * @todo testing
 */
export const peekErr: {
  <V, E>(fn: (err: E) => any): (self: Result<V, E>) => Result<V, E>;
  <V, E>(self: Result<V, E>, fn: (err: E) => any): Result<V, E>;
} = Macro.dualify(1, <V, E>(self: Result<V, E>, fn: (err: E) => any) => {
  if (isErr(self)) fn(self.error);
  return self;
});

/**
 * @todo documentation
 * @todo testing
 */
export const map: {
  <V, E, To>(mapper: Function.Mapper<V, To>): (self: Result<V, E>) => Result<To, E>;
  <V, E, To>(self: Result<V, E>, mapper: Function.Mapper<V, To>): Result<To, E>;
} = Macro.dualify(1, <V, E, To>(self: Result<V, E>, mapper: Function.Mapper<V, To>) =>
  isOk(self) ? ok(mapper(self.value)) : self
);

/**
 * @todo documentation
 * @todo testing
 */
export const mapErr: {
  <V, E, To>(mapper: (error: E) => To): (self: Result<V, E>) => Result<V, To>;
  <V, E, To>(self: Result<V, E>, mapper: (error: E) => To): Result<V, To>;
} = Macro.dualify(1, <V, E, To>(self: Result<V, E>, mapper: (error: E) => To) =>
  isErr(self) ? err(mapper(self.error)) : self
);

/**
 * @todo documentation
 * @todo testing
 */
export const or: {
  <V, E>(fn: (error: E) => V): (self: Result<V, E>) => V;
  <V, E>(self: Result<V, E>, fn: (error: E) => V): V;
  <V>(value: V): (self: Result<V, any>) => V;
  <V>(self: Result<V, any>, value: V): V;
} = Macro.dualify(1, <V, E>(self: Result<V, E>, fnOrValue: ((error: E) => V) | V) =>
  isOk(self) ? self.value
  : Function.isFunction(fnOrValue) ? fnOrValue(self.error)
  : fnOrValue
);

/**
 * @todo documentation
 * @todo testing
 */
export const unfold: {
  <V, E>(): (self: Result<V, E>) => Unfold<Result<V, E>>;
  <V, E>(self: Result<V, E>): Unfold<Result<V, E>>;
} = Macro.dualify(0, <V, E>(self: Result<V, E>) => {
  if (isErr(self)) return self as Unfold<Result<V, E>>;
  let inner = self.value;

  for (let i = 0; i < MAX_UNFOLD_DEPTH; i++) {
    if (!isResult(inner)) break;
    if (isErr(inner)) return inner as Unfold<Result<V, E>>;
    inner = inner.value as V;
  }

  return ok(inner) as Unfold<Result<V, E>>;
});

/**
 * @todo documentation
 * @todo testing
 */
export const flatten: {
  <V, E>(): (self: Result<V, E>) => Flatten<Result<V, E>>;
  <V, E>(self: Result<V, E>): Flatten<Result<V, E>>;
} = Macro.dualify(0, <V, E>(self: Result<V, E>) => {
  if (isErr(self) || !isResult(self.value) || isErr(self.value))
    return self as Flatten<Result<V, E>>;
  return self.value as Flatten<Result<V, E>>;
});

/**
 * @todo documentation
 * @todo testing
 */
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

/**
 * @todo documentation
 * @todo testing
 */
export const check: {
  <V, E>(predicate: Function.Predicate<V>): (self: Result<V, E>) => Result<V, E | never>;
  <V, E>(self: Result<V, E>, predicate: Function.Predicate<V>): Result<V, E | never>;
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
    isOk(self) ?
      predicate(self.value) ? self
      : fail ? err(Macro.evaluate(fail))
      : err()
    : self
);

/**
 * @todo documentation
 * @todo testing
 */
export const toMaybe: {
  <V>(): (self: Result<V, any>) => Maybe.Maybe<V>;
  <V>(self: Result<V, any>): Maybe.Maybe<V>;
} = Macro.dualify(0, <V>(self: Result<V, any>) =>
  isOk(self) ? Maybe.some(self.value) : Maybe.none()
);
