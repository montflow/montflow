import { Schema as S } from "effect";
import * as Alias from "../alias/index.js";
import * as Async from "../async/index.js";
import * as Function from "../function/index.js";
import { Evaluable, Sync, Table } from "../global/index.js";
import * as Macro from "../macro/index.js";
import * as Nothing from "../nothing/index.js";
import * as Number from "../number/index.js";
import * as Object from "../object/index.js";
import * as Result from "../result/index.js";

/**
 * @todo documentation
 * @todo testing
 */
export const SomeId = "some" as const;

/**
 * @todo documentation
 */
export type SomeId = typeof SomeId;

/**
 * @todo documentation
 */
export type Some<out V> = {
  readonly _id: SomeId;
  readonly value: V;
};

/**
 * @todo documentation
 */
export const SomeSchema = <TInner = unknown>(schema?: S.Schema<TInner>) =>
  S.Struct({ _id: S.Literal(SomeId), value: schema ?? S.Unknown }).pipe(S.asSchema);

/**
 * @todo documentation
 * @todo testing
 */
export const NoneId = "none" as const;

/**
 * @todo documentation
 */
export type NoneId = typeof NoneId;

/**
 * @todo documentation
 */
export type None = {
  readonly _id: NoneId;
};

/**
 * @todo documentation
 */
export const NoneSchema = S.Struct({ _id: S.Literal(NoneId) }).pipe(S.asSchema);

/**
 * @todo documentation
 */
export type Maybe<V = never> = Some<V> | None;

/**
 * @todo documentation
 */
export const Schema = <TInner = unknown>(schema?: S.Schema<TInner>) =>
  S.Union(SomeSchema(schema), NoneSchema).pipe(S.asSchema);

/**
 * @internal
 * @todo documentation
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
 * Extracts the type of `V` from a `Maybe` type
 * @template TMaybe input `Maybe` type
 * @returns `V`'s type
 */
export type Value<TMaybe extends Any> = TMaybe extends Some<infer V> ? V : never;

/**
 * Unwraps nested `Maybe` type once
 * @template TRoot input `Maybe` type to flatten
 * @returns `Maybe` flattened once
 */
export type Flatten<TRoot extends Any> =
  [TRoot] extends [Maybe<infer TValue>] ?
    [TValue] extends [Maybe<infer TNested>] ?
      Maybe<TNested>
    : TRoot
  : never;

/**
 * Recursively unwraps nested `Maybe` type **infinitely**. Not recommended for general use. Use computationally simpler versions like `Flatten` or `Unfold`
 * @template TRoot `Maybe` type to unfold
 * @returns `Maybe` of depth 1
 * @see {@link Flatten}
 * @see {@link Unfold}
 */
export type InfiniteUnfold<TRoot extends Any> =
  [TRoot] extends [Maybe<infer TValue>] ?
    [TValue] extends [Maybe<infer TNested>] ?
      InfiniteUnfold<Maybe<TNested>>
    : TRoot
  : never;

/**
 * Recursively unwraps nested `Maybe` type up to `Limit`. For an **infinite** version checkout `Maybe.InfiniteUnfold` or simpler `Result.Flatten`
 * @template TRoot `Maybe` type to unfold
 * @template TLimit maximun depth for unesting. Default `512`
 * @returns `Maybe` of depth 1 if depth ≤ `Limit`. Otherwise the unfolded result up to `Limit`
 * @see {@link InfiniteUnfold}
 * @see {@link Flatten}
 */
export type Unfold<TRoot extends Any, TLimit extends number = typeof MAX_UNFOLD_DEPTH> =
  TLimit extends 0 ? TRoot
  : [TRoot] extends [Maybe<infer TValue>] ?
    [TValue] extends [Any] ?
      Unfold<TValue, Number.Decrement<TLimit>>
    : TRoot
  : never;

/**
 * Shorthand for `Promise` of a `Maybe`
 * @template V inner `Some` value type
 * @returns {Promise<Maybe<V>>}
 */
export type Promise<V> = Alias.Promise<Maybe<V>>;

/**
 * @constructor
 * @todo documentation
 * @todo testing
 */
export const some: {
  (): Some<never>;
  <V>(value: V): Some<V>;
} = Macro.cast(
  <V = never>(value: V): Some<V> => ({
    _id: SomeId,
    value: value,
  })
);

/**
 * @constructor
 * @todo documentation
 * @todo testing
 */
export const none = Macro.singleton("@montflow/none", (): None => ({ _id: "none" }));

/**
 * @constructor
 * @todo documentation
 * @todo testing
 */
export const fromNullish = <V>(value: V): Maybe<NonNullable<V>> => Macro.todoImpl();

/**
 * @constructor
 * @todo documentation
 * @todo testing
 */
export const _try: { <V>(f: Sync<V>): Maybe<V> } = Macro.todoImpl;

export { _try as try };

/**
 * @todo documentation
 * @todo testing
 */
export const tryPromise: {
  <V>($try: Async.Lazy<V>): Maybe<V>;
  <V>($try: Alias.Promise<V>): Maybe<V>;
} = Macro.todoImpl;

/**
 * @todo documentation
 * @todo testing
 */
export const isSome = (thing: unknown): thing is Some<unknown> => Macro.todoImpl();

/**
 * @todo documentation
 * @todo testing
 */
export const isNone = (thing: unknown): thing is None => Macro.todoImpl();

/**
 * @todo documentation
 * @todo testing
 */
export const isMaybe = (thing: unknown): thing is Maybe<unknown> =>
  isSome(thing) || isNone(thing);

/**
 * @todo documentation
 * @todo testing
 */
export const map: {
  <From, To>(mapper: Function.Mapper<From, To>): (self: Maybe<From>) => Maybe<To>;
  <From, To>(self: Maybe<From>, mapper: Function.Mapper<From, To>): Maybe<To>;
} = Macro.dualify(1, <From, To>(self: Maybe<From>, mapper: Function.Mapper<From, To>) =>
  isSome(self) ? some(mapper(self.value)) : none()
);

/**
 * @todo documentation
 * @todo testing
 */
export class UnwrapError extends Error {
  constructor() {
    super(`Maybe is "None". Unwrap operation failed`);
  }
}

/**
 * @todo documentation
 * @todo testing
 */
export const unwrap: {
  <V>(): (self: Maybe<V>) => V;
} = Macro.todoImpl;

/**
 * @todo documentation
 * @todo testing
 */
export const or: {
  <V>(value: Evaluable<V>): (self: Maybe<V>) => V;
  <V>(self: Maybe<V>, value: Evaluable<V>): V;
} = Macro.dualify(1, <V>(self: Maybe<V>, value: Evaluable<V>) =>
  isSome(self) ? self.value : Macro.evaluate(value)
);

/**
 * @todo documentation
 * @todo testing
 */
export const orElse: {
  <V, Or>(value: Evaluable<Or>): (self: Maybe<V>) => Or;
  <V, Or>(self: Maybe<V>, value: Evaluable<Or>): Or;
} = Macro.dualify(1, <V, Or>(self: Maybe<V>, value: Evaluable<Or>) =>
  isSome(self) ? self.value : Macro.evaluate(value)
);

/**
 * @todo documentation
 * @todo testing
 */
export const unfold: {
  <V>(self: Maybe<V>): Unfold<Maybe<V>>;
} = <V>(self: Maybe<V>) => {
  if (isNone(self)) return self as Unfold<Maybe<V>>;
  let inner = self.value;
  for (let i = 0; i < MAX_UNFOLD_DEPTH; i++) {
    if (!isMaybe(inner)) break;
    if (isNone(inner)) return inner as Unfold<Maybe<V>>;
    inner = inner.value as V;
  }
  return some(inner) as Unfold<Maybe<V>>;
};

/**
 * @todo documentation
 * @todo testing
 */
export const flatten: {
  <V>(self: Maybe<V>): Flatten<Maybe<V>>;
} = <V>(self: Maybe<V>) => {
  if (isNone(self) || !isMaybe(self.value) || isNone(self.value)) {
    return self as Flatten<Maybe<V>>;
  }
  return self.value as Flatten<Maybe<V>>;
};

/**
 * @todo documentation
 * @todo testing
 */
export const flatmap: {
  <From, To>(mapper: Function.Mapper<From, Maybe<To>>): (self: Maybe<From>) => Maybe<To>;
  <From, To>(self: Maybe<From>, mapper: Function.Mapper<From, Maybe<To>>): Maybe<To>;
} = Macro.dualify(1, <From, To>(self: Maybe<From>, mapper: Function.Mapper<From, Maybe<To>>) =>
  isSome(self) ? mapper(self.value) : none()
);

/**
 * @todo documentation
 * @todo testing
 */
export const check: {
  <V>(predicate: Function.Predicate<V>): (self: Maybe<V>) => Maybe<V>;
  <V>(self: Maybe<V>, predicate: Function.Predicate<V>): Maybe<V>;
} = Macro.dualify(1, <V>(self: Maybe<V>, predicate: Function.Predicate<V>) =>
  isSome(self) ?
    predicate(self.value) ? self
    : none()
  : none()
);

/**
 * @todo documentation
 * @todo testing
 */
export const tap: {
  <V>(fn: (value: V) => any): (self: Maybe<V>) => Maybe<V>;
  <V>(self: Maybe<V>, fn: (value: V) => any): Maybe<V>;
} = Macro.dualify(1, <V>(self: Maybe<V>, fn: (value: V) => any) => {
  isSome(self) ? fn(self.value) : null;
  return self;
});

/**
 * @todo documentation
 * @todo testing
 */
export const is: {
  <Type>(guard: Function.Guard<Type>): (self: Unknown) => Maybe<Type>;
  <Type>(self: Unknown, guard: Function.Guard<Type>): Maybe<Type>;
} = Macro.dualify(1, <Type>(self: Unknown, guard: Function.Guard<Type>) =>
  isNone(self) ? none()
  : guard(self.value) ? some(self.value)
  : none()
);

/**
 * @todo documentation
 * @todo testing
 */
export const tapNone: {
  <V>(fn: () => any): (self: Maybe<V>) => Maybe<V>;
  <V>(self: Maybe<V>, fn: () => any): Maybe<V>;
} = Macro.dualify(1, <V>(self: Maybe<V>, fn: () => any) => {
  isNone(self) ? fn() : null;
  return self;
});

/**
 * @todo documentation
 * @todo testing
 */
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

/**
 * @todo documentation
 * @todo testing
 */
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

/**
 * @todo documentation
 * @todo testing
 */
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

/**
 * @todo documentation
 * @todo testing
 */
export const property: {
  <R extends Table, K extends keyof R>(key: K): (self: Maybe<R>) => Maybe<R[K]>;
  <R extends Table, K extends keyof R>(self: Maybe<R>, key: K): Maybe<R[K]>;
} = Macro.dualify(1, <R extends Table, K extends keyof R>(self: Maybe<R>, key: K) => {
  if (isNone(self)) return self;
  if (!Object.isObject(self.value) || !Object.hasKey(self.value, key)) return none();
  return some(self.value[key]);
});

/**
 * @todo documentation
 * @todo testing
 */
export const toResult: {
  <V, E>(error: E): (self: Maybe<V>) => Result.Result<V, E>;
  <V, E>(self: Maybe<V>, error: E): Result.Result<V, E>;
  <V>(): (self: Maybe<V>) => Result.Result<V, Nothing.Nothing>;
  <V>(self: Maybe<V>): Result.Result<V, Nothing.Nothing>;
} = Macro.dualify(1, <V, E>(self: Maybe<V>, error?: E) => {
  if (isNone(self)) return error ? Result.err(error) : Result.err();
  return Result.ok(self.value);
});

/**
 * @todo documentation
 * @todo testing
 */
export const parseJson: {
  (): (self: Maybe<string>) => Maybe<any>;
  (self: Maybe<string>): Maybe<any>;
} = Macro.dualify(0, (self: Maybe<string>) => tryMap(self, JSON.parse));
