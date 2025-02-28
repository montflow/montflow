import * as Alias from "../alias/index.js";
import { Evaluable, Sync, Table } from "../common/index.js";
import * as Function from "../function/index.js";
import * as Macro from "../macro/index.js";
import * as Nothing from "../nothing/index.js";
import * as Number from "../number/index.js";
import * as Object from "../object/index.js";
import * as Result from "../result/index.js";

import { Schema as S } from "effect";

export type Some<out V> = {
  readonly _tag: "some";
  readonly value: V;
};

export const SomeSchema = S.Union(
  S.Struct({ _tag: S.Literal("some") }),
  S.Struct({ _tag: S.Literal("some"), value: S.Unknown })
);

export type None = {
  readonly _tag: "none";
};

export const NoneSchema = S.Struct({ _tag: S.Literal("none") });

export const Schema = S.Union(SomeSchema, NoneSchema);

export type Maybe<V = never> = Some<V> | None;

/**
 * @internal
 */
export const MAX_UNFOLD_DEPTH = 512;

/**
 * @alias Maybe<any> of any `V`
 */
export type Any = Maybe<any>;

/**
 * @alias Maybe<unknown> of unknown `V`
 */
export type Unknown = Maybe<unknown>;

/**
 * @alias Maybe<unknown> of never `V`
 */
export type Never = Maybe<never>;

/**
 * Extracts the inner `Some` value type
 * @template M input `Maybe` type
 * @returns inner `Some` value type
 */
export type SomeOf<M extends Any> = M extends Some<infer V> ? V : never;

/**
 * Unwraps nested `Maybe` type once
 * @template Root input `Maybe` type to flatten
 * @returns `Maybe` flattened once
 */
export type Flatten<Root extends Any> =
  [Root] extends [Maybe<infer RootSome>] ?
    [RootSome] extends [Maybe<infer NestedSome>] ?
      Maybe<NestedSome>
    : Root
  : never;

/**
 * Recursively unwraps nested `Maybe` type **infinitely**. Not recommended for general use. Use simpler versions like `Flatten` or `Unfold`
 * @template Root `Maybe` type to unfold
 * @returns `Maybe` of depth 1
 * @see {@link make.Flatten}
 * @see {@link make.Unfold}
 */
export type InfiniteUnfold<Root extends Any> =
  [Root] extends [Maybe<infer RootSome>] ?
    [RootSome] extends [Maybe<infer NestedSome>] ?
      InfiniteUnfold<Maybe<NestedSome>>
    : Root
  : never;
``;

/**
 * Recursively unwraps nested `Maybe` type up to `Limit`. For an **infinite** version checkout `Maybe.InfiniteUnfold` or simpler `Result.Flatten`
 * @template Root `Maybe` type to unfold
 * @template Limit maximun depth for unesting. Default `512`
 * @returns `Maybe` of depth 1 if depth ≤ `Limit`. Otherwise the unfolded result up to `Limit`
 * @see {@link Result.InfiniteUnfold}
 * @see {@link Result.Flatten}
 */
export type Unfold<Root extends Any, Limit extends number = typeof MAX_UNFOLD_DEPTH> =
  Limit extends 0 ? Root
  : [Root] extends [Maybe<infer RootSome>] ?
    [RootSome] extends [Any] ?
      Unfold<RootSome, Number.Decrement<Limit>>
    : Root
  : never;

/**
 * Shorthand for `Promise` of a `Maybe`
 * @template V inner `Some` value type
 * @returns {Promise<Maybe<V>>}
 */
export type Promise<V> = Alias.Promise<Maybe<V>>;

export const some: {
  (): Some<never>;
  <V>(value: V): Some<V>;
} = function (): any {
  return arguments.length <= 0 ? { _tag: "some" } : { _tag: "some", value: arguments[0] };
};

/**
 * @internal
 */
let _none: undefined | None;

export const none: {
  (): None;
} = () => (_none !== undefined ? _none : (_none = { _tag: "none" }));

export const make: {
  (tag: "some"): Maybe<never>;
  <V>(tag: "some", value: V): Maybe<V>;
  <V = never>(tag: "none"): Maybe<V>;
} = function () {
  const [tag] = arguments;

  if (tag === "none") {
    return none();
  }

  if (arguments.length >= 2) {
    return some(arguments[1]);
  }

  return some();
} as typeof make;

/**
 * Converts nullish value into `Maybe`
 * @constructor
 * @template V value
 * @param {V} value
 * @returns {Maybe<Exclude<V, null | undefined>>} `Some` if `value` in non nullish. `None` otherwise
 */
export function fromNullish<V>(value: V): Maybe<Exclude<V, null | undefined>> {
  if (value === null || value === undefined) return none();
  return some(value as Exclude<V, null | undefined>);
}

/**
 * Converts `Promise` into `Future`.
 * @constructor
 * @template V inner `Some` type
 * @param {Promise<V>} promise target promise
 * @returns {Async<V>} a future. `Some` if the promise resolved with expected value. `None` if it threw error/failed.
 * @see {@link Async}
 */
export async function fromPromise<V>(promise: Alias.Promise<V>): Promise<V> {
  try {
    return some(await promise);
  } catch (_) {
    return none();
  }
}

/**
 * Converts procedure that could potentially throw into `Maybe`
 * @constructor
 * @template V inner type of possible `Some` value
 * @param {Procedure<V>} f that could throw
 * @returns {Maybe<V>} `Some` if procedure succeeds. `None` if it throws error
 */
export function _try<V>(f: Sync<V>): Maybe<V> {
  try {
    return some(f());
  } catch (_) {
    return none();
  }
}

export { _try as try };

export const isSome = (thing: unknown): thing is Some<unknown> => S.is(SomeSchema)(thing);
export const isNone = (thing: unknown): thing is None => S.is(NoneSchema)(thing);
export const isMaybe = (thing: unknown): thing is Maybe<unknown> => S.is(Schema)(thing);

export const map: {
  <From, To>(mapper: Function.Mapper<From, To>): (self: Maybe<From>) => Maybe<To>;
  <From, To>(self: Maybe<From>, mapper: Function.Mapper<From, To>): Maybe<To>;
} = Macro.dualify(1, <From, To>(self: Maybe<From>, mapper: Function.Mapper<From, To>) =>
  isSome(self) ? some(mapper(self.value)) : none()
);

export const unwrap: {
  <V>(): (self: Maybe<V>) => V;
  <V>(self: Maybe<V>): V;
} = Macro.dualify(0, <V>(self: Maybe<V>) =>
  isSome(self) ? self.value : Macro.panicWith("Unwrap failed. Found `None` instance.")
);

export const or: {
  <V>(value: Evaluable<V>): (self: Maybe<V>) => V;
  <V>(self: Maybe<V>, value: Evaluable<V>): V;
} = Macro.dualify(1, <V>(self: Maybe<V>, value: Evaluable<V>) =>
  isSome(self) ? self.value : Macro.evaluate(value)
);

export const orElse: {
  <V, Or>(value: Evaluable<Or>): (self: Maybe<V>) => Or;
  <V, Or>(self: Maybe<V>, value: Evaluable<Or>): Or;
} = Macro.dualify(1, <V, Or>(self: Maybe<V>, value: Evaluable<Or>) =>
  isSome(self) ? self.value : Macro.evaluate(value)
);

export const unfold: {
  <V>(): (self: Maybe<V>) => Unfold<Maybe<V>>;
  <V>(self: Maybe<V>): Unfold<Maybe<V>>;
} = Macro.dualify(0, <V>(self: Maybe<V>) => {
  if (isNone(self)) return self as Unfold<Maybe<V>>;
  let inner = self.value;
  for (let i = 0; i < MAX_UNFOLD_DEPTH; i++) {
    if (!isMaybe(inner)) break;
    if (isNone(inner)) return inner as Unfold<Maybe<V>>;
    inner = inner.value as V;
  }
  return some(inner) as Unfold<Maybe<V>>;
});

export const flatten: {
  <V>(): (self: Maybe<V>) => Flatten<Maybe<V>>;
  <V>(self: Maybe<V>): Flatten<Maybe<V>>;
} = Macro.dualify(0, <V>(self: Maybe<V>) => {
  if (isNone(self) || !isMaybe(self.value) || isNone(self.value))
    return self as Flatten<Maybe<V>>;
  return self.value as Flatten<Maybe<V>>;
});

export const flatmap: {
  <From, To>(mapper: Function.Mapper<From, Maybe<To>>): (self: Maybe<From>) => Maybe<To>;
  <From, To>(self: Maybe<From>, mapper: Function.Mapper<From, Maybe<To>>): Maybe<To>;
} = Macro.dualify(1, <From, To>(self: Maybe<From>, mapper: Function.Mapper<From, Maybe<To>>) =>
  isSome(self) ? mapper(self.value) : none()
);

export const check: {
  <V>(predicate: Function.Predicate<V>): (self: Maybe<V>) => Maybe<V>;
  <V>(self: Maybe<V>, predicate: Function.Predicate<V>): Maybe<V>;
} = Macro.dualify(1, <V>(self: Maybe<V>, predicate: Function.Predicate<V>) =>
  isSome(self) ?
    predicate(self.value) ? self
    : none()
  : none()
);

export const peek: {
  <V>(fn: (value: V) => any): (self: Maybe<V>) => Maybe<V>;
  <V>(self: Maybe<V>, fn: (value: V) => any): Maybe<V>;
} = Macro.dualify(1, <V>(self: Maybe<V>, fn: (value: V) => any) => {
  isSome(self) ? fn(self.value) : null;
  return self;
});

export const is: {
  <Type>(guard: Function.Guard<Type>): (self: Unknown) => Maybe<Type>;
  <Type>(self: Unknown, guard: Function.Guard<Type>): Maybe<Type>;
} = Macro.dualify(1, <Type>(self: Unknown, guard: Function.Guard<Type>) =>
  isNone(self) ? none()
  : guard(self.value) ? some(self.value)
  : none()
);

export const whenSome: {
  <V>(fn: (some: V) => any): (self: Maybe<V>) => Maybe<V>;
  <V>(self: Maybe<V>, fn: (some: V) => any): Maybe<V>;
} = Macro.dualify(1, <V>(self: Maybe<V>, fn: (some: V) => any) => {
  isSome(self) ? fn(self.value) : null;
  return self;
});

export const whenNone: {
  <V>(fn: () => any): (self: Maybe<V>) => Maybe<V>;
  <V>(self: Maybe<V>, fn: () => any): Maybe<V>;
} = Macro.dualify(1, <V>(self: Maybe<V>, fn: () => any) => {
  isNone(self) ? fn() : null;
  return self;
});

export const match: {
  <V>(branches: { some?: (value: V) => any; none?: () => any }): (self: Maybe<V>) => Maybe<V>;
  <V>(self: Maybe<V>, branches: { some?: (value: V) => any; none?: () => any }): Maybe<V>;
} = Macro.dualify(
  1,
  <V>(self: Maybe<V>, branches: { some?: (value: V) => any; none?: () => any }) => {
    isSome(self) ? branches.some?.(self.value) : branches.none?.();
    return self;
  }
);

export const collapse: {
  <From, To>(branches: {
    some: (value: From) => To;
    none: () => To;
  }): (self: Maybe<From>) => To;
  <From, To>(self: Maybe<From>, branches: { some: (value: From) => To; none: () => To }): To;
} = Macro.dualify(
  1,
  <From, To>(self: Maybe<From>, branches: { some: (value: From) => To; none: () => To }) =>
    isSome(self) ? branches.some(self.value) : branches.none()
);

export const tryMap: {
  <From, To>(mapper: (some: From) => To): (self: Maybe<From>) => Maybe<To>;
  <From, To>(self: Maybe<From>, mapper: (some: From) => To): Maybe<To>;
} = Macro.dualify(1, <From, To>(self: Maybe<From>, mapper: (some: From) => To) => {
  try {
    return isSome(self) ? some(mapper(self.value)) : none();
  } catch {
    return none();
  }
});

export const property: {
  <R extends Table, K extends keyof R>(key: K): (self: Maybe<R>) => Maybe<R[K]>;
  <R extends Table, K extends keyof R>(self: Maybe<R>, key: K): Maybe<R[K]>;
} = Macro.dualify(1, <R extends Table, K extends keyof R>(self: Maybe<R>, key: K) => {
  if (isNone(self)) return self;
  if (!Object.isObject(self.value) || !Object.hasKey(self.value, key)) return none();
  return some(self.value[key]);
});

export const toResult: {
  <V, E>(error: E): (self: Maybe<V>) => Result.Result<V, E>;
  <V, E>(self: Maybe<V>, error: E): Result.Result<V, E>;
  <V>(): (self: Maybe<V>) => Result.Result<V, Nothing.Nothing>;
  <V>(self: Maybe<V>): Result.Result<V, Nothing.Nothing>;
} = Macro.dualify(1, <V, E>(self: Maybe<V>, error?: E) => {
  if (isNone(self)) return error ? Result.err(error) : Result.err();
  return Result.ok(self.value);
});

export const parseJson: {
  (): (self: Maybe<string>) => Maybe<any>;
  (self: Maybe<string>): Maybe<any>;
} = Macro.dualify(0, (self: Maybe<string>) => tryMap(self, JSON.parse));
