import { Effect, Either, Schema as S } from "effect";
import { ConstructorOf, Sync, Table } from "../common/types.js";

import * as Alias from "../alias/index.js";
import * as Fault from "../fault/index.js";
import * as Function from "../function/index.js";
import * as Macro from "../macro/index.js";
import * as Maybe from "../maybe/index.js";
import * as Number from "../number/index.js";
import * as String from "../string/index.js";

export const OkSchema = S.Union(
  S.Struct({ _tag: S.Literal("ok") }),
  S.Struct({ _tag: S.Literal("ok"), value: S.Unknown })
);

export const ErrSchema = S.Union(
  S.Struct({ _tag: S.Literal("err") }),
  S.Struct({ _tag: S.Literal("err"), error: S.Unknown })
);

export const Schema = S.Union(OkSchema, ErrSchema);

/**
 * Represents the successful outcome of operation
 * @template V type of inner value
 */
export type Ok<out V> = {
  readonly _tag: "ok";
  readonly value: V;
};

/**
 * Represents the unsuccessful outcome of operation
 * @template E type of inner error
 */
export type Err<out E> = {
  readonly _tag: "err";
  readonly error: E;
};

export const MAX_UNFOLD_DEPTH = 512;

/**
 * Either `Ok<V>` or `Err<E>`
 * @template V type of some's inner value
 */
export type Result<V = never, E = never> = Ok<V> | Err<E>;

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
 */
export type Unfold<Root extends Any, Limit extends number = typeof MAX_UNFOLD_DEPTH> =
  Limit extends 0 ? Root
  : [Root] extends [Result<infer RootOk, infer RootErr>] ?
    [RootOk] extends [Result<infer NestedOk, infer NestedErr>] ?
      Unfold<Result<NestedOk, NestedErr | RootErr>, Number.Decrement<Limit>>
    : Root
  : never;

export type Promise<V, E> = Alias.Promise<Result<V, E>>;

export function ok(): Ok<never>;
export function ok<V = unknown>(value: V): Ok<V>;

/** @internal */
export function ok() {
  return arguments.length <= 0 ?
      { _tag: "ok" }
    : {
        _tag: "ok",
        value: arguments[0],
      };
}

export function err(): Err<never>;
export function err<E = unknown>(error: E): Err<E>;

/** @internal */
export function err() {
  return arguments.length <= 0 ?
      { _tag: "err" }
    : {
        _tag: "err",
        error: arguments[0],
      };
}

export function make(tag: "ok"): Result<never, never>;
export function make<V = unknown, E = unknown>(tag: "ok", value: V): Result<V, E>;

export function make(tag: "err"): Result<never, never>;
export function make<V = unknown, E = unknown>(tag: "err", error: E): Result<V, E>;

/** @internal */
export function make<T>(tag: "ok" | "err"): Ok<never> | Ok<T> | Err<never> | Err<T> {
  if (tag === "ok") {
    return arguments.length <= 1 ? ok() : ok(arguments[1]);
  }

  return arguments.length <= 1 ? err() : err(arguments[1]);
}

/**
 * @constructor Create `Err` wrapped faults
 */
export const fault: {
  /**
   * @constructor Create `Err` wrapped `Fault.Base` from tag
   * @example
   * const err = Result.fault("CustomFault")
   * //    ^? Result.Err<Fault.Base<"CustomFault">>
   */
  <const TTag extends Fault.Tag>(tag: TTag): Err<Fault.Base<TTag>>;

  /**
   * @constructor Create `Err` wrapped `Fault.Extended` from tag
   * @example
   * const err = Result.fault("CustomFault", { issues: [ "invalid_stuff" ]})
   * //    ^? Result.Err<Fault.Extended<"CustomFault", { issues: string[] }>>
   */
  <const TTag extends Fault.Tag, TContext extends Table>(
    tag: TTag,
    context: TContext
  ): Err<Fault.Extended<TTag, TContext>>;

  /**
   * @constructor Create `Err` wrapped `Fault.Base` from constructor
   * @example
   * class CustomFault extends Fault.Base("CustomFault") {}
   * const err = Result.fault(CustomFault)
   * //    ^? Result.Err<CustomFault>
   */
  <const TFault extends Fault.Base<Fault.Tag>>(
    constructor: Fault.IsBase<TFault> extends true ? ConstructorOf<TFault> : never
  ): Err<TFault>;

  /**
   * @constructor Create `Err` wrapped `Fault.Base` from constructor
   * @example
   * type Context = { code: number }
   * class CustomFault extends Fault.Extended("CustomFault")<Context> {}
   * const err = Result.fault(CustomFault, { code: 404 })
   * //    ^? Result.Err<CustomFault>
   */
  <const TFault extends Fault.Extended<Fault.Tag, Table>>(
    constructor: ConstructorOf<TFault>,
    context: Fault.IsExtened<TFault> extends true ? Fault.ContextOf<TFault> : void
  ): Err<TFault>;
} = function (): any {
  if (String.isString(arguments[0])) {
    const tag = arguments[0] as Fault.Tag;

    if (arguments.length >= 2) {
      const context = arguments[1];

      return err(Fault.make(tag, context));
    }

    return err(Fault.make(tag));
  }

  const Construct = arguments[0];

  if (arguments.length >= 2) {
    const context = arguments[1];

    return err(new Construct(context));
  }

  return err(new Construct());
};

function try_<V>($try: Sync<V>): Result<V, never>;
function try_<V>(options: {
  readonly try: Sync<V>;
  finally?: Function.Callback;
}): Result<V, never>;
function try_<V, E>(options: {
  readonly try: Sync<V>;
  readonly catch: (error: unknown) => E;
  finally?: Function.Callback;
}): Result<V, E>;

function try_<V, E>(
  tryOrOptions:
    | Sync<V>
    | { readonly try: Sync<V>; finally?: Function.Callback }
    | {
        readonly try: Sync<V>;
        readonly catch: (error: unknown) => E;
        finally?: Function.Callback;
      }
): Result<V, E> {
  const [$try, $catch, $finally] =
    Function.isCallable(tryOrOptions) ?
      [tryOrOptions, undefined, undefined]
    : [
        tryOrOptions.try,
        "catch" in tryOrOptions ? tryOrOptions.catch : undefined,
        tryOrOptions.finally,
      ];

  try {
    return ok($try());
  } catch (error) {
    return $catch ? err($catch(error)) : err();
  } finally {
    $finally?.();
  }
}

export { try_ as try };

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
  return S.is(OkSchema)(resultOrThing);
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

/** @internal */
export function isErr<E>(resultOrThing: Result<any, E> | unknown): resultOrThing is Err<E> {
  return S.is(ErrSchema)(resultOrThing);
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
export function isResult(thing: unknown): thing is Unknown {
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
  isOk(self) ? ok(mapper(self.value)) : self
);

export const mapErr: {
  <V, E, To>(mapper: (error: E) => To): (self: Result<V, E>) => Result<V, To>;
  <V, E, To>(self: Result<V, E>, mapper: (error: E) => To): Result<V, To>;
} = Macro.dualify(1, <V, E, To>(self: Result<V, E>, mapper: (error: E) => To) =>
  isErr(self) ? err(mapper(self.error)) : self
);

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

export const toMaybe: {
  <V>(): (self: Result<V, any>) => Maybe.Maybe<V>;
  <V>(self: Result<V, any>): Maybe.Maybe<V>;
} = Macro.dualify(0, <V>(self: Result<V, any>) =>
  isOk(self) ? Maybe.some(self.value) : Maybe.none()
);

export const toEffect = <V, E>(self: Result<V, E>): Effect.Effect<V, E> =>
  isOk(self) ? Effect.succeed(self.value) : Effect.fail(self.error);

export const toEither = <V, E>(self: Result<V, E>): Either.Either<V, E> =>
  isOk(self) ? Either.right(self.value) : Either.left(self.error);

export const expand = <A, E1, E2, R>(
  self: Effect.Effect<Result<A, E1>, E2, R>
): Effect.Effect<A, E1 | E2, R> =>
  self.pipe(
    Effect.flatMap(result =>
      isOk(result) ? Effect.succeed(result.value) : Effect.fail(result.error)
    )
  );

export const merge = <A, E>(self: Effect.Effect<A, E>): Effect.Effect<Result<A, E>> =>
  self.pipe(
    Effect.mapBoth({
      onSuccess: v => ok(v),
      onFailure: e => err(e),
    }),
    Effect.merge
  );
