import { dualify, Evaluable, Guard, Mapper, Predicate } from "../function";
import { evaluate, panic } from "../macro";
import { Create as CreateNothing, Nothing } from "../nothing";
import { Decrement } from "../number";
import { hasKey, isObject } from "../object";
import { Err, Ok, Result } from "../result";

/**
 * Represents the presence of a value
 * @template V type of inner value
 */
export type Some<V> = {
  readonly some: true;
  readonly value: V;
};

/**
 * Represents the absence of a value
 */
export type None = {
  readonly some: false;
};

/**
 * Either `Some<V>` or `None`
 * @template V type of some's inner value
 */
export type Maybe<V> = Some<V> | None;

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
export type Flatten<Root extends Any> = [Root] extends [Maybe<infer RootSome>]
  ? [RootSome] extends [Maybe<infer NestedSome>]
    ? Maybe<NestedSome>
    : Root
  : never;

/**
 * Recursively unwraps nested `Maybe` type **infinitely**. Not recommended for general use. Use simpler versions like `Flatten` or `Unfold`
 * @template Root `Maybe` type to unfold
 * @returns `Maybe` of depth 1
 * @see {@link Create.Flatten}
 * @see {@link Create.Unfold}
 */
export type InfiniteUnfold<Root extends Any> = [Root] extends [Maybe<infer RootSome>]
  ? [RootSome] extends [Maybe<infer NestedSome>]
    ? InfiniteUnfold<Maybe<NestedSome>>
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
export type Unfold<
  Root extends Any,
  Limit extends number = typeof MAX_UNFOLD_DEPTH,
> = Limit extends 0
  ? Root
  : [Root] extends [Maybe<infer RootSome>]
    ? [RootSome] extends [Any]
      ? Unfold<RootSome, Decrement<Limit>>
      : Root
    : never;

/**
 * Shorthand for `Promise` of a `Maybe`
 * @template V inner `Some` value type
 * @returns {Promise<Maybe<V>>}
 */
export type Future<V> = Promise<Maybe<V>>;

/**
 * Creates empty `Some`
 * @constructor
 * @returns {Some<None>} empty `Some`
 */
export function Some(): Some<Nothing>;

/**
 * Creates `Some` w/ inner `value`
 * @constructor
 * @template V inner `value` type
 * @param {V} value
 * @returns {Some<V>} `Some` with inner `value`
 */
export function Some<V>(value: V): Some<V>;

/**
 * @internal
 */
export function Some<V>(value?: V): Some<V> | Some<Nothing> {
  return {
    some: true,
    value: value !== undefined ? value : CreateNothing(),
  } as Some<V> | Some<Nothing>;
}

/**
 * @internal
 */
let _none: undefined | None;

/**
 * Creates `None`
 * @constructor
 * @returns {None} `None`
 */
export function None(): None {
  return _none !== undefined ? _none : (_none = { some: false });
}

/**
 * Creates `None`, with type of `Maybe<V>`
 * @constructor
 * @template V inner `some` type
 * @returns {Maybe<V>} maybe. At runtime this will be a `None`
 */
export function Create<V>(): Maybe<V>;

/**
 * Creates `Some<V>` with type of `Maybe<V>`
 * @template V inner `some` type
 * @param {V} value inner `some` value
 * @returns {Maybe<V>} maybe. At runtime this will be a `Some<V>`
 */
export function Create<V>(value: V): Maybe<V>;

/**
 * @internal
 */
export function Create<V>(value?: V): Maybe<V> {
  return value === undefined ? None() : Some(value);
}

export const make = Create;

/**
 * Converts nullish value into `Maybe`
 * @constructor
 * @template V value
 * @param {V} value
 * @returns {Maybe<Exclude<V, null | undefined>>} `Some` if `value` in non nullish. `None` otherwise
 */
export function FromNullish<V>(value: V): Maybe<Exclude<V, null | undefined>> {
  if (value === null || value === undefined) return None();
  return Some(value as Exclude<V, null | undefined>);
}

/**
 * Converts `Promise` into `Future`.
 * @constructor
 * @template V inner `Some` type
 * @param {Promise<V>} promise target promise
 * @returns {Future<V>} a future. `Some` if the promise resolved with expected value. `None` if it threw error/failed.
 * @see {@link Future}
 */
export async function FromPromise<V>(promise: Promise<V>): Future<V> {
  try {
    return Some(await promise);
  } catch (_) {
    return None();
  }
}

/**
 * Converts procedure that could potentially throw into `Maybe`
 * @constructor
 * @template V inner type of possible `Some` value
 * @param {Procedure<V>} f that could throw
 * @returns {Maybe<V>} `Some` if procedure succeeds. `None` if it throws error
 */
export function FromTryCatch<V>(f: () => V): Maybe<V> {
  try {
    return Some(f());
  } catch (_) {
    return None();
  }
}

/**
 * Checks if provided `Maybe` is of type `Some`
 * @template V inner `Some` type
 * @param {Maybe<V>} maybe to be checked
 * @returns {boolean} `true` if `Some`. Otherwise `false`
 */
export function isSome<V>(maybe: Maybe<V>): maybe is Some<V>;

/**
 * Checks if thing is `Some`
 * @param {unknown} thing to be checked
 * @returns {boolean} `true` if `Some`. Otherwise `false`
 */
export function isSome(thing: unknown): thing is Some<unknown>;

/**
 * @internal
 */
export function isSome<V>(maybeOrThing: Maybe<V> | unknown): maybeOrThing is Some<V> {
  if (typeof maybeOrThing !== "object") return false;
  if (maybeOrThing === null) return false;
  if (Object.keys(maybeOrThing).length !== 2) return false;
  if (
    !("some" in maybeOrThing && typeof maybeOrThing.some === "boolean") ||
    !("value" in maybeOrThing)
  )
    return false;

  return maybeOrThing.some;
}

/**
 * Alias for `isSome`
 * @template V inner `Some` type
 * @param {Maybe<V>} maybe maybe to be checked
 * @returns {boolean} `true` if `Some`. Otherwise `false`
 * @see {@link isSome}
 */
export const notNone = isSome;

/**
 * Checks if provided `Maybe` is of type `None`
 * @template V inner `Some` type
 * @param {Maybe<V>} maybe maybe to be checked
 * @returns {boolean} `true` if `None`. Otherwise `false`
 */
export function isNone<V>(maybe: Maybe<V>): maybe is None;

/**
 * Checks if thing is `None`
 * @param {unknown} thing maybe to be checked
 * @returns {boolean} `true` if `None`. Otherwise `false`
 */
export function isNone(thing: unknown): thing is None;

/**
 * @internal implementation
 */
export function isNone<V>(maybeOrThing: Maybe<V> | unknown): maybeOrThing is None {
  if (typeof maybeOrThing !== "object") return false;
  if (maybeOrThing === null) return false;
  if (Object.keys(maybeOrThing).length !== 1) return false;
  if (!("some" in maybeOrThing && typeof maybeOrThing.some === "boolean")) return false;
  return !maybeOrThing.some;
}

/**
 * Alais for `isNone`
 * @template V inner `Some` type
 * @param {Maybe<V>} maybe maybe to be checked
 * @returns {boolean} `true` if `None`. Otherwise `false`
 * @see {@link isNone}
 */
export const notSome = isNone;

/**
 * Checks if thing is of type `Maybe`
 * @param {unknown} thing data to be checked
 * @returns {boolean} `true` if thing is `Maybe`. Otherwise `false`
 */
export function isMaybe(thing: unknown): thing is Maybe<unknown> {
  return isSome(thing) || isNone(thing);
}

export const map: {
  <From, To>(mapper: Mapper<From, To>): (self: Maybe<From>) => Maybe<To>;
  <From, To>(self: Maybe<From>, mapper: Mapper<From, To>): Maybe<To>;
} = dualify(2, <From, To>(self: Maybe<From>, mapper: Mapper<From, To>) =>
  isSome(self) ? Some(mapper(self.value)) : None()
);

export const unwrap: {
  <V>(): (self: Maybe<V>) => V;
  <V>(self: Maybe<V>): V;
} = dualify(1, <V>(self: Maybe<V>) =>
  isSome(self) ? self.value : panic(new Error("unwrap failed. Maybe is `none`"))
);

export const or: {
  <V>(value: Evaluable<V>): (self: Maybe<V>) => V;
  <V>(self: Maybe<V>, value: Evaluable<V>): V;
} = dualify(2, <V>(self: Maybe<V>, value: Evaluable<V>) =>
  isSome(self) ? self.value : evaluate(value)
);

export const orElse: {
  <V, Or>(value: Evaluable<Or>): (self: Maybe<V>) => Or;
  <V, Or>(self: Maybe<V>, value: Evaluable<Or>): Or;
} = dualify(2, <V, Or>(self: Maybe<V>, value: Evaluable<Or>) =>
  isSome(self) ? self.value : evaluate(value)
);

export const unfold: {
  <V>(): (self: Maybe<V>) => Unfold<Maybe<V>>;
  <V>(self: Maybe<V>): Unfold<Maybe<V>>;
} = dualify(1, <V>(self: Maybe<V>) => {
  if (isNone(self)) return self as Unfold<Maybe<V>>;
  let inner = self.value;
  for (let i = 0; i < MAX_UNFOLD_DEPTH; i++) {
    if (!isMaybe(inner)) break;
    if (isNone(inner)) return inner as Unfold<Maybe<V>>;
    inner = inner.value as V;
  }
  return Some(inner) as Unfold<Maybe<V>>;
});

export const flatten: {
  <V>(): (self: Maybe<V>) => Flatten<Maybe<V>>;
  <V>(self: Maybe<V>): Flatten<Maybe<V>>;
} = dualify(1, <V>(self: Maybe<V>) => {
  if (isNone(self) || !isMaybe(self.value) || isNone(self.value))
    return self as Flatten<Maybe<V>>;
  return self.value as Flatten<Maybe<V>>;
});

export const flatmap: {
  <From, To>(mapper: Mapper<From, Maybe<To>>): (self: Maybe<From>) => Maybe<To>;
  <From, To>(self: Maybe<From>, mapper: Mapper<From, Maybe<To>>): Maybe<To>;
} = dualify(2, <From, To>(self: Maybe<From>, mapper: Mapper<From, Maybe<To>>) =>
  isSome(self) ? mapper(self.value) : None()
);

export const check: {
  <V>(predicate: Predicate<V>): (self: Maybe<V>) => Maybe<V>;
  <V>(self: Maybe<V>, predicate: Predicate<V>): Maybe<V>;
} = dualify(2, <V>(self: Maybe<V>, predicate: Predicate<V>) =>
  isSome(self) ? (predicate(self.value) ? self : None()) : None()
);

export const peek: {
  <V>(fn: (value: V) => any): (self: Maybe<V>) => Maybe<V>;
  <V>(self: Maybe<V>, fn: (value: V) => any): Maybe<V>;
} = dualify(2, <V>(self: Maybe<V>, fn: (value: V) => any) => {
  isSome(self) ? fn(self.value) : null;
  return self;
});

export const is: {
  <Type>(guard: Guard<Type>): (self: Unknown) => Maybe<Type>;
  <Type>(self: Unknown, guard: Guard<Type>): Maybe<Type>;
} = dualify(2, <Type>(self: Unknown, guard: Guard<Type>) =>
  isNone(self) ? None() : guard(self.value) ? Some(self.value) : None()
);

export const whenSome: {
  <V>(fn: (some: V) => any): (self: Maybe<V>) => Maybe<V>;
  <V>(self: Maybe<V>, fn: (some: V) => any): Maybe<V>;
} = dualify(2, <V>(self: Maybe<V>, fn: (some: V) => any) => {
  isSome(self) ? fn(self.value) : null;
  return self;
});

export const whenNone: {
  <V>(fn: () => any): (self: Maybe<V>) => Maybe<V>;
  <V>(self: Maybe<V>, fn: () => any): Maybe<V>;
} = dualify(2, <V>(self: Maybe<V>, fn: () => any) => {
  isNone(self) ? fn() : null;
  return self;
});

export const match: {
  <V>(branches: { some?: (value: V) => any; none?: () => any }): (self: Maybe<V>) => Maybe<V>;
  <V>(self: Maybe<V>, branches: { some?: (value: V) => any; none?: () => any }): Maybe<V>;
} = dualify(
  2,
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
} = dualify(
  2,
  <From, To>(self: Maybe<From>, branches: { some: (value: From) => To; none: () => To }) =>
    isSome(self) ? branches.some(self.value) : branches.none()
);

export const tryMap: {
  <From, To>(mapper: (some: From) => To): (self: Maybe<From>) => Maybe<To>;
  <From, To>(self: Maybe<From>, mapper: (some: From) => To): Maybe<To>;
} = dualify(2, <From, To>(self: Maybe<From>, mapper: (some: From) => To) => {
  try {
    return isSome(self) ? Some(mapper(self.value)) : None();
  } catch {
    return None();
  }
});

export const property: {
  <R extends Record<any, any>, K extends keyof R>(key: K): (self: Maybe<R>) => Maybe<R[K]>;
  <R extends Record<any, any>, K extends keyof R>(self: Maybe<R>, key: K): Maybe<R[K]>;
} = dualify(2, <R extends Record<any, any>, K extends keyof R>(self: Maybe<R>, key: K) => {
  if (isNone(self)) return self;
  if (!isObject(self.value) || !hasKey(self.value, key)) return None();
  return Some(self.value[key]);
});

export const toResult: {
  <V, E>(error: E): (self: Maybe<V>) => Result<V, E>;
  <V, E>(self: Maybe<V>, error: E): Result<V, E>;
  <V>(): (self: Maybe<V>) => Result<V, Nothing>;
  <V>(self: Maybe<V>): Result<V, Nothing>;
} = dualify(2, <V, E>(self: Maybe<V>, error?: E) => {
  if (isNone(self)) return error ? Err(error) : Err();
  return Ok(self.value);
});

export const parseJson: {
  (): (self: Maybe<string>) => Maybe<any>;
  (self: Maybe<string>): Maybe<any>;
} = dualify(1, (self: Maybe<string>) => tryMap(self, JSON.parse));
