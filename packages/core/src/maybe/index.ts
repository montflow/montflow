import { Mapper } from "solzu";
import { Guard, isCallable, Nullary, Operator, Predicate } from "../function";
import { panic } from "../macro";
import { Nothing } from "../nothing";
import { hasKey, isObject } from "../object";
import { Err, Ok, Result } from "../result";
import { Decrement } from "../types";

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
 * @see {@link Maybe.Flatten}
 * @see {@link Maybe.Unfold}
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
    value: value !== undefined ? value : Nothing(),
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
export function Maybe<V>(): Maybe<V>;

/**
 * Creates `Some<V>` with type of `Maybe<V>`
 * @template V inner `some` type
 * @param {V} value inner `some` value
 * @returns {Maybe<V>} maybe. At runtime this will be a `Some<V>`
 */
export function Maybe<V>(value: V): Maybe<V>;

/**
 * @internal
 */
export function Maybe<V>(value?: V): Maybe<V> {
  return value === undefined ? None() : Some(value);
}

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

/**
 * Transforms the inner value of `Some` with the provided mapping function. Otherwise, returns `None`
 * @template From input `Maybe`s `Some` value
 * @template To output `Maybe`s `Some` value
 * @param {Mapper<From, To>} mapper mapping function
 * @returns {Operator<Maybe<From>, Maybe<To>>} function that takes `Maybe<From>` input and returns new mapped `Maybe<To>` if input was `Some`
 */
export function map<From, To>(mapper: Mapper<From, To>): Operator<Maybe<From>, Maybe<To>> {
  return maybe => (isSome(maybe) ? Some(mapper(maybe.value)) : None());
}

/**
 * Dangerously assumes input is instance of `Some` and returns inner value
 * @template V inner `Some` value type
 * @throws {Error} when input is not `Some`
 * @returns {Operator<Maybe<V>, V>} inner `Some` value
 */
export function unwrap<V>(): Operator<Maybe<V>, V> {
  return maybe =>
    isSome(maybe) ? maybe.value : panic(new Error("unwrap failed. Maybe is `none`"));
}

/**
 * If input is instance of `Some` returns inner value. Otherwise returns the alternative provided `value`
 * @template V inner `Some` value type
 * @param {V} value alternative return value when provided input is instance of `None`
 * @returns {V} `Some`'s inner value or the provided value
 */
export function or<V>(value: V): Operator<Maybe<V>, V>;

/**
 * If input is instance of `Some` returns inner value. Otherwise returns the alternative provided `value`
 * @template V inner `Some` value type
 * @template Other alternative value type
 * @param {Other} other alternative return value when provided input is instance of `None`
 * @returns {V} `Some`'s inner value or the provided value
 */
export function or<V, Other>(other: Other | Nullary<Other>): Operator<Maybe<V>, V | Other>;

/** @internal */
export function or<V, Other = V>(other: Other | Nullary<Other>): Operator<Maybe<V>, V | Other> {
  return maybe => (isSome(maybe) ? maybe.value : isCallable(other) ? other() : other);
}

/**
 * Turns a nested maybe into a maybe of depth 1. Input maybe should never exceed a depth of `MAX_UNFOLD_DEPTH`.
 * @template V inner Some value type
 * @returns flattened maybe
 * @see {@link MAX_UNFOLD_DEPTH}
 */
export function unfold<V>(): Operator<Maybe<V>, Unfold<Maybe<V>>> {
  return maybe => {
    if (isNone(maybe)) return maybe as Unfold<Maybe<V>>;
    let inner = maybe.value;
    for (let i = 0; i < MAX_UNFOLD_DEPTH; i++) {
      if (!isMaybe(inner)) break;
      if (isNone(inner)) return inner as Unfold<Maybe<V>>;
      inner = inner.value as V;
    }
    return Some(inner) as Unfold<Maybe<V>>;
  };
}

/**
 * Turns a nested `Maybe` into a maybe with 1 less depth.
 * @template V inner `Some` value type
 * @returns function with nested maybe input and returns flattened maybe
 */
export function flatten<V>(): Operator<Maybe<V>, Flatten<Maybe<V>>> {
  return maybe => {
    if (isNone(maybe) || !isMaybe(maybe.value) || isNone(maybe.value))
      return maybe as Flatten<Maybe<V>>;
    return maybe.value as Flatten<Maybe<V>>;
  };
}

/**
 * Combines `map` and `flatten`. Inner some value is mapped onto new `Maybe` which is then flattened.
 * @template From inputs `Maybe`s `Some` value type
 * @template To output `Maybe`s `Some` value type
 * @param {Operator<From, Maybe<To>>} mapper mapping function
 * @see {@link map}
 * @see {@link flatten}
 */
export function flatmap<From, To>(
  mapper: Mapper<From, Maybe<To>>
): Operator<Maybe<From>, Maybe<To>> {
  return maybe => (isSome(maybe) ? mapper(maybe.value) : None());
}

/**
 * Checks `Some`'s value againts provided predicated condition. If passed returns the same `Some`, otherwise `None`
 * @template V inner `Some`'s value type
 * @param {Operator<V, boolean>} predicate function to check inner `Some` value (if it exists)
 * @returns {Operator<Maybe<V>, Maybe<V>>} function that takes `Maybe` and returns same `Maybe` if instance of `Some` and predicate evaluates to `true`. Otherwise `None`
 */
export function check<V>(predicate: Predicate<V>): Operator<Maybe<V>, Maybe<V>> {
  return maybe => (isSome(maybe) ? (predicate(maybe.value) ? maybe : None()) : None());
}

/**
 * Perform a side-effect **IF** inner `Some`'s value exists
 * @template V inner `Some`'s value type
 * @param {(some: V) => any} fn function that recieves innver `Some` value
 * @returns {Operator<Maybe<V>, Maybe<V>>} function that takes `Maybe` and returns same `Maybe`. If `Some` performs `fn` of value.
 */
export function peek<V>(fn: (value: V) => any): Operator<Maybe<V>, Maybe<V>> {
  return maybe => {
    isSome(maybe) ? fn(maybe.value) : null;
    return maybe;
  };
}

/**
 * Type guards a Maybe's inner Some value. Returns None if guard fails or input is None
 * @template Type guarded output type
 * @param {Guard<Type>} guard type guard function
 * @returns {Operator<Unknown, Maybe<Type>>} function that takes unknown `Maybe` and returns `Maybe<Type>`
 */
export function is<Type>(guard: Guard<Type>): Operator<Unknown, Maybe<Type>> {
  return maybe => (isNone(maybe) ? None() : guard(maybe.value) ? Some(maybe.value) : None());
}

/**
 * Conditinally executes function when maybe is `Some` with inner value.
 * @template V inner `Maybe` value type
 * @param {(some: V) => any} fn function with single argument of `V`
 * @returns {Operator<Maybe<V>, Maybe<V>>} function with `Maybe` input and returns that same `Maybe`
 */
export function whenSome<V>(fn: (some: V) => any): Operator<Maybe<V>, Maybe<V>> {
  return maybe => {
    isSome(maybe) ? fn(maybe.value) : null;
    return maybe;
  };
}

/**
 * Conditinally executes function when maybe is `None`.
 * @template V inner `Maybe` value type
 * @param {() => any} fn callback function
 * @returns {Operator<Maybe<V>, Maybe<V>>} function with `Maybe` input and returns that same `Maybe`
 */
export function whenNone<V>(fn: () => any): Operator<Maybe<V>, Maybe<V>> {
  return maybe => {
    isNone(maybe) ? fn() : null;
    return maybe;
  };
}

/**
 * Executes branch function based on the instance type of input `Maybe`.
 * @template V the type of value contained within `Some`
 * @param {Object} branches object containing the possible branches
 * - `some`: function that takes the value of `Some`.
 * - `none`: callback function
 * @returns {Operator<Maybe<V>, Maybe<V>>} a function that takes a `Maybe` input and returns that same `Maybe`
 */
export function match<V>(branches: {
  some?: (value: V) => any;
  none?: () => any;
}): Operator<Maybe<V>, Maybe<V>> {
  return maybe => {
    isSome(maybe) ? branches.some?.(maybe.value) : branches.none?.();
    return maybe;
  };
}

export function collapse<From, To>(branches: {
  some: (value: From) => To;
  none: () => To;
}): Operator<Maybe<From>, To> {
  return maybe => (isSome(maybe) ? branches.some(maybe.value) : branches.none());
}

/**
 * Like `map` but with mapper that could potentially throw
 * @template From original inner `Some` value type
 * @template To output inner `Some` value type
 * @param {Mapper<From, To>} mapper function that maps inner `Some` value to some other value. Could throw.
 * @returns {Operator<Maybe<From>, Maybe<To>>} function that given input `Maybe` uses mapper function to map inner `Some` value. If input is `None` or `mapper` throws, function returns `None`
 * @see {@link map}
 */
export function tryMap<From, To>(mapper: (some: From) => To): Operator<Maybe<From>, Maybe<To>> {
  return maybe => {
    try {
      return isSome(maybe) ? Some(mapper(maybe.value)) : None();
    } catch {
      return None();
    }
  };
}

/**
 * Extract value of object property
 * @template R inner `Some` value type. Must extends any `Record` or `Object` type
 * @template K type of `V` indexable key
 * @param {K} key the key to look for
 * @returns {Operator<Maybe<R>, Maybe<R[K]>>} function with input `Maybe<V>` and returns `Some` if input is `Some` and given property exists. Otherwise `None`
 */
export function property<R extends Record<any, any>, K extends keyof R>(
  key: K
): Operator<Maybe<R>, Maybe<R[K]>>;

/**
 * Extract value of object property if it exists
 * @template R inner `Some` value type. Must extends any `Record` or `Object` type
 * @param {keyof R} key the key to look for
 * @returns {Operator<Maybe<R>, Maybe<R[keyof R]>>} function with input `Maybe<V>` and returns `Some` if input is `Some` and given property exists. Otherwise `None`
 */
export function property<R extends Record<any, any>>(
  key: keyof R
): Operator<Maybe<R>, Maybe<R[keyof R]>>;

/**
 * @internal
 */
export function property<R extends Record<any, any>, K extends keyof R>(
  key: K
): Operator<Maybe<R>, Maybe<R[K]>> {
  return maybe => {
    if (isNone(maybe)) return maybe;
    if (!isObject(maybe.value) || !hasKey(maybe.value, key)) return None();
    return Some(maybe.value[key]);
  };
}

/**
 * Converts `Maybe` into `Result`
 * @template V target `Ok` value type
 * @template E target `Err` error type
 * @param {E} error value of error incase input `Maybe` is of instance `None`
 * @returns {Operator<Maybe<V>, Result<V, E>>} function with input `Maybe`, and output of converted `Result`
 */
export function toResult<V, E>(error: E): Operator<Maybe<V>, Result<V, E>>;

/**
 * Converts `Maybe` into `Result`
 * @template V target `Ok` value type
 * @returns {Operator<Maybe<V>, Result<V, Nothing>>} function with input `Maybe`, and output of converted `Result`. Always `Nothing` in `Err` channel
 */
export function toResult<V>(): Operator<Maybe<V>, Result<V, Nothing>>;

/**
 * @internal
 */
export function toResult<V, E>(error?: E): Operator<Maybe<V>, Result<V, E | Nothing>> {
  return maybe => {
    if (isNone(maybe)) return error ? Err(error) : Err();
    return Ok(maybe.value);
  };
}

/**
 * Safely trys to parse json string. If the parsing throws errors, operator returns `None`
 * @returns {Operator<Maybe<string>, Maybe<any>>} function with input `Maybe<string>` attempts to `JSON.parse` it. If successful then `Some(value)` otherwise `None`
 */
export function parseJson(): Operator<Maybe<string>, Maybe<unknown>> {
  return maybe => tryMap(JSON.parse)(maybe);
}
