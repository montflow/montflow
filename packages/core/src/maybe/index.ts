import * as Alias from "../alias/index.js";
import * as Async from "../async/index.js";
import * as Domain from "../domain/index.js";
import * as Function from "../function/index.js";
import { Evaluable, Sync, Table } from "../global/index.js";
import * as Macro from "../macro/index.js";
import * as Nothing from "../nothing/index.js";
import * as Number from "../number/index.js";
import * as Object from "../object/index.js";
import * as Result from "../result/index.js";

/**
 * Unique domain identifier for the Maybe algebraic data type.
 */
export const Id = "maybe" as const;

/**
 * Type of the unique domain identifier for the Maybe algebraic data type.
 */
export type Id = typeof Id;

/**
 * Tag used to discriminate the `Some` variant at runtime.
 */
export const SomeTag = "some" as const;

/**
 * Type of the `Some` discriminant tag.
 */
export type SomeTag = typeof SomeTag;

/**
 * The `Some` variant carries a present value of type `V`.
 *
 * @template V Value type carried by the `Some` variant
 */
export type Some<out V> = {
  readonly [Domain.Id]: Id;
  readonly [Domain.Tag]: SomeTag;
  readonly value: V;
};

/**
 * Tag used to discriminate the `None` variant at runtime.
 */
export const NoneTag = "none" as const;

/**
 * Type of the `None` discriminant tag.
 */
export type NoneTag = typeof NoneTag;

/**
 * The `None` variant represents the absence of a value.
 */
export type None = {
  readonly [Domain.Id]: Id;
  readonly [Domain.Tag]: NoneTag;
};

/**
 * A Maybe value that is either `Some<V>` (present) or `None` (absent).
 *
 * @template V Value type in the `Some` branch
 */
export type Maybe<V = never> = Some<V> | None;

/**
 * @internal
 * Maximum depth for `unfold` to prevent infinite recursion with cyclic or
 * deeply nested structures.
 */
export const MAX_UNFOLD_DEPTH = 512;

/**
 * Alias for a `Maybe<any>` value.
 */
export type Any = Maybe<any>;

/**
 * Alias for a `Maybe<unknown>` value.
 */
export type Unknown = Maybe<unknown>;

/**
 * Alias for a `Maybe<never>` value.
 */
export type Never = Maybe<never>;

/**
 * Extracts the inner value type `V` from a `Maybe<V>`.
 *
 * @template TMaybe Input `Maybe` type
 * @returns The extracted inner value type or `never` for `None`
 */
export type Value<TMaybe extends Any> = TMaybe extends Some<infer V> ? V : never;

/**
 * Unwraps one level of nesting from `Maybe<Maybe<V>>` to `Maybe<V>`.
 *
 * @template TRoot Input `Maybe` type to flatten
 * @returns The flattened `Maybe` type
 */
export type Flatten<TRoot extends Any> =
  [TRoot] extends [Maybe<infer TValue>] ?
    [TValue] extends [Maybe<infer TNested>] ?
      Maybe<TNested>
    : TRoot
  : never;

/**
 * Recursively unwraps nested `Maybe` types without limit.
 * Not recommended for general use. Prefer `Flatten` or `Unfold`.
 *
 * @template TRoot `Maybe` type to unfold
 * @returns A `Maybe` with a single level of nesting
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
 * Recursively unwraps nested `Maybe` types up to `TLimit` levels.
 *
 * For an infinite version use `Maybe.InfiniteUnfold`, or use `Flatten` for a
 * single-level unwrap.
 *
 * @template TRoot `Maybe` type to unfold
 * @template TLimit Maximum depth for unnesting. Default `512`
 * @returns A `Maybe` with at most a single level of nesting
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
 * Shorthand for a `Promise` that resolves to a `Maybe<V>`.
 *
 * @template V Inner `Some` value type
 * @returns A promise of a `Maybe<V>`
 */
export type Promise<V> = Alias.Promise<Maybe<V>>;

/**
 * @constructor
 *
 * Constructs a `Some` value, wrapping a present value.
 *
 * @template V Value type
 * @param value The value to wrap
 * @returns A `Some<V>`
 *
 * @todo testing
 */
export const some: {
  (): Some<never>;
  <V>(value: V): Some<V>;
} = Macro.cast(
  <V>(value?: V): Some<V | undefined> => ({
    [Domain.Id]: Id,
    [Domain.Tag]: SomeTag,
    value: value === Macro.undefined ? Macro.undefined : value,
  })
);

/**
 * @constructor
 *
 * Constructs the `None` value representing absence.
 *
 * @returns A `None` value
 */
export const none = Macro.singleton(
  "@montflow/none",
  (): None => ({ [Domain.Id]: Id, [Domain.Tag]: NoneTag })
);

/**
 * @constructor
 *
 * Converts a possibly nullish value into a `Maybe`.
 * Returns `none()` if the input is `null` or `undefined`, otherwise `some(value)`.
 *
 * @template V Input value type
 * @param value The value that may be nullish
 * @returns `Maybe<NonNullable<V>>`
 */
export const fromNullish = <V>(value: V): Maybe<NonNullable<V>> =>
  value === null || value === undefined ? none() : some(value);

/**
 * Returns `Some` with value when predicate result is true, otherwise `None`.
 *
 * @template V Input value type
 * @param self The value to test
 * @param predicate Predicate used to decide presence
 * @returns `Maybe<V>`
 *
 * @todo testing
 */
export const fromPredicate: {
  <V>(self: V, predicate: Function.Predicate<V>): Maybe<V>;
  <V>(predicate: Function.Predicate<V>): (value: V) => Maybe<V>;
} = Macro.dualify(1, <V>(self: V, predicate: Function.Predicate<V>) =>
  predicate(self) ? some(self) : none()
);

/**
 * Returns `Some` with value when `condition` is true, otherwise `None`.
 *
 * @template V Input value type
 * @param self The value to test
 * @param condition Condition used to decide presence
 * @returns `Maybe<V>`
 *
 * @todo testing
 */
export const _if: {
  <V>(self: V, condition: Evaluable<boolean>): Maybe<V>;
  <V>(condition: Evaluable<boolean>): (value: V) => Maybe<V>;
} = Macro.dualify(1, <V>(self: V, condition: Evaluable<boolean>) =>
  Macro.evaluate(condition) ? some(self) : none()
);

export { _if as if };

/**
 * Executes a function and captures exceptions as `None`.
 * Returns `Some<V>` if the function succeeds, otherwise `None`.
 *
 * @template V Return type of the function
 * @param f Function to execute
 * @returns `Maybe<V>`
 *
 * @todo testing
 */
const _try = <V>(f: Sync<V>): Maybe<V> => {
  try {
    return some(f());
  } catch {
    return none();
  }
};

export { _try as try };

/**
 * Executes an async computation and converts it to a `Promise<Maybe<V>>`.
 * Returns `some(value)` when resolved, otherwise `none()` if it rejects.
 *
 * @template V Resolved value type
 * @param $try Lazy async function or promise to resolve
 * @returns A promise resolving to `Maybe<V>`
 *
 * @todo testing
 */
export const tryPromise: {
  <V>($try: Async.Lazy<V>): Promise<V>;
  <V>($try: Alias.Promise<V>): Promise<V>;
} = async <V>($try: Async.Lazy<V> | Alias.Promise<V>): Promise<V> => {
  try {
    const value = Function.isCallable($try) ? await $try() : await $try;
    return some(value);
  } catch {
    return none();
  }
};

/**
 * Returns `true` if the given value is a `Some` variant.
 *
 * @param thing Unknown value
 * @returns Type guard for `Some<unknown>`
 *
 * @todo testing
 */
export const isSome = (thing: unknown): thing is Some<unknown> =>
  Object.isObject(thing) &&
  Object.hasKeys(thing, [Domain.Id, Domain.Tag, "value"]) &&
  Object.size(thing) === 3 &&
  thing[Domain.Id] === Id &&
  thing[Domain.Tag] === SomeTag;

/**
 * Returns `true` if the given value is a `None` variant.
 *
 * @param thing Unknown value
 * @returns Type guard for `None`
 *
 * @todo testing
 */
export const isNone = (thing: unknown): thing is None =>
  Object.isObject(thing) &&
  Object.hasKeys(thing, [Domain.Id, Domain.Tag]) &&
  Object.size(thing) === 2 &&
  thing[Domain.Id] === Id &&
  thing[Domain.Tag] === NoneTag;

/**
 * Returns `true` if the given value is a `Maybe` (`Some` or `None`).
 *
 * @param thing Unknown value
 * @returns Type guard for `Maybe<unknown>`
 *
 * @todo testing
 */
export const isMaybe = (thing: unknown): thing is Maybe<unknown> =>
  isNone(thing) || isSome(thing);

/**
 * Transforms the inner value with `mapper` when `Some`; returns `None` otherwise.
 *
 * @template From Input value type
 * @template To Output value type
 * @param mapper Function applied to the `Some` value
 * @param self `Maybe<TFrom>` to map
 * @returns A function expecting a `Maybe<From>` and returning `Maybe<To>`
 *
 * @todo testing
 */
export const map: {
  <TFrom, TTo>(mapper: Function.Mapper<TFrom, TTo>): (self: Maybe<TFrom>) => Maybe<TTo>;
  <TFrom, TTo>(self: Maybe<TFrom>, mapper: Function.Mapper<TFrom, TTo>): Maybe<TTo>;
} = Macro.dualify(1, <TFrom, TTo>(self: Maybe<TFrom>, mapper: Function.Mapper<TFrom, TTo>) =>
  isSome(self) ? some(mapper(self.value)) : none()
);

/**
 * Error thrown when attempting to `unwrap` a `None` value.
 *
 * @todo testing
 */
export class UnwrapError extends Error {
  [Domain.Tag] = "unwrap-error";

  constructor() {
    super(`Maybe is "None". Unwrap operation failed`);
  }
}

/**
 * Extracts the inner value from `Some`, or throws `UnwrapError` for `None`.
 *
 * @template V Value type
 * @param self The `Maybe<V>` to unwrap
 * @returns The inner value when `Some`
 * @throws {UnwrapError} If `self` is `None`
 *
 * @todo testing
 */
export const unwrap = <V>(self: Maybe<V>): V => {
  if (isNone(self)) throw new UnwrapError();
  return self.value;
};

/**
 * When `Some`, returns the original value, otherwise returns the providedfallback value.
 *
 * @template V Some value type
 * @template TOr Fallback type
 * @param value Fallback value or thunk
 * @param self `Maybe<V>` to collapse
 * @returns A function that collapses a `Maybe<V>` to `Or`
 *
 * @todo testing
 */
export const orElse: {
  <V, TOr>(value: Evaluable<TOr>): (self: Maybe<V>) => TOr;
  <V, TOr>(self: Maybe<V>, value: Evaluable<TOr>): TOr;
} = Macro.dualify(1, <V, TOr>(self: Maybe<V>, value: Evaluable<TOr>) =>
  isSome(self) ? self.value : Macro.evaluate(value)
);

/**
 * Fully unfolds nested `Maybe` values until a non-`Maybe` is reached or
 * until `MAX_UNFOLD_DEPTH` is hit.
 *
 * @template V Some value type
 * @param self Possibly nested `Maybe`
 * @returns `None` if any level is `None`, otherwise `Some<Innermost>`
 *
 * @see {@link MAX_UNFOLD_DEPTH}
 *
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
 * Flattens exactly one level from nested `Maybe`.
 *
 * @template V Some value type
 * @param self A `Maybe` possibly containing another `Maybe`
 * @returns Flattened `Maybe`
 *
 * @todo testing
 */
export const flatten = <V>(self: Maybe<V>): Flatten<Maybe<V>> => {
  if (isNone(self) || !isMaybe(self.value) || isNone(self.value)) {
    return self as Flatten<Maybe<V>>;
  }
  return self.value as Flatten<Maybe<V>>;
};

/**
 * Maps and flattens given `Maybe` using the provided mapper.
 *
 * @template From Input value type
 * @template To Output value type
 * @param mapper Function mapping `From` to `Maybe<To>`
 * @returns A function expecting a `Maybe<From>` and returning `Maybe<To>`
 *
 * @see {@link map}
 * @see {@link flatten}
 *
 * @todo testing
 */
export const flatmap: {
  <TFrom, TTo>(mapper: Function.Mapper<TFrom, Maybe<TTo>>): (self: Maybe<TFrom>) => Maybe<TTo>;
  <TFrom, TTo>(self: Maybe<TFrom>, mapper: Function.Mapper<TFrom, Maybe<TTo>>): Maybe<TTo>;
} = Macro.dualify(
  1,
  <TFrom, TTo>(self: Maybe<TFrom>, mapper: Function.Mapper<TFrom, Maybe<TTo>>) =>
    isSome(self) ? mapper(self.value) : none()
);

/**
 * If `Some` and predicate is true with value returns self (`Some<V>`), otherwise returns `None`.
 *
 * @template V Value type
 * @param predicate Predicate applied to the `Some` value
 * @returns A function that filters a `Maybe<V>`
 *
 * @todo testing
 */
export const filter: {
  <V>(predicate: Function.Predicate<V>): (self: Maybe<V>) => Maybe<V>;
  <V>(self: Maybe<V>, predicate: Function.Predicate<V>): Maybe<V>;
} = Macro.dualify(1, <V>(self: Maybe<V>, predicate: Function.Predicate<V>) =>
  isSome(self) ?
    predicate(self.value) ? self
    : none()
  : none()
);

/**
 * Runs proivided tapper if `Some` with value. Otherwise it's skipped.
 *
 * @template V Value type
 * @param tapper Function to run if `Some` with value
 * @returns The original `Maybe<V>`
 *
 * @todo testing
 */
export const tap: {
  <V>(tapper: Function.Tapper<V>): (self: Maybe<V>) => Maybe<V>;
  <V>(self: Maybe<V>, tapper: Function.Tapper<V>): Maybe<V>;
} = Macro.dualify(1, <V>(self: Maybe<V>, tapper: Function.Tapper<V>) => {
  isSome(self) ? tapper(self.value) : null;
  return self;
});

/**
 * @alias {@link tap}
 */
export const whenSome = tap;

/**
 * Runs provided callback if `None`.
 *
 * @template V Value type
 * @param tapper Function to run if `None`
 * @returns The original `Maybe<V>`
 *
 * @todo testing
 */
export const tapNone: {
  <V>(tapper: Function.Callback): (self: Maybe<V>) => Maybe<V>;
  <V>(self: Maybe<V>, tapper: Function.Callback): Maybe<V>;
} = Macro.dualify(1, <V>(self: Maybe<V>, fn: () => any) => {
  isNone(self) ? fn() : null;
  return self;
});

export const whenNone = tapNone;

/**
 * Narrows the inner value type using a type guard. Returns `Some` when the
 * guard succeeds; `None` otherwise or when the receiver is `None`.
 *
 * @template Type The target narrowed type
 * @param guard User-defined type guard for the value
 * @returns A function that narrows a `Maybe<unknown>` to `Maybe<Type>`
 *
 * @todo testing
 */
export const is: {
  <TType>(guard: Function.Guard<TType>): (self: Unknown) => Maybe<TType>;
  <TType>(self: Unknown, guard: Function.Guard<TType>): Maybe<TType>;
} = Macro.dualify(1, <Type>(self: Unknown, guard: Function.Guard<Type>) =>
  isNone(self) ? none()
  : guard(self.value) ? some(self.value)
  : none()
);

/**
 * Executes side-effect branches based on the variant and returns the original `Maybe`.
 *
 * @template V Value type
 * @param branches Optional handlers for `some` and `none`
 * @returns The original `Maybe<V>`
 *
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
 * Applies a mapper that may throw; converts thrown errors into `None`.
 *
 * @template From Input value type
 * @template To Output value type
 * @param mapper Mapping function possibly throwing
 * @returns A function mapping `Maybe<From>` to `Maybe<To>`
 *
 * @todo testing
 */
export const tryMap: {
  <TFrom, TTo>(mapper: (some: TFrom) => TTo): (self: Maybe<TFrom>) => Maybe<TTo>;
  <TFrom, TTo>(self: Maybe<TFrom>, mapper: (some: TFrom) => TTo): Maybe<TTo>;
} = Macro.dualify(1, <TFrom, TTo>(self: Maybe<TFrom>, mapper: (some: TFrom) => TTo) => {
  try {
    return isSome(self) ? some(mapper(self.value)) : none();
  } catch {
    return none();
  }
});

/**
 * Safely reads a property from an object inside a `Maybe`.
 * Returns `Some(value[key])` when the receiver is `Some` and the property exists;
 * otherwise returns `None`.
 *
 * @template R Object type
 * @template K Key of `R`
 * @param key The property to read
 * @returns A function mapping `Maybe<R>` to `Maybe<R[K]>`
 *
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
 * Converts a `Maybe<V>` into a `Result<V, E>`.
 * - When `Some`, returns `ok(value)`.
 * - When `None`, returns `err(error)`; if `error` is omitted, uses `Nothing.Nothing`.
 *
 * @template V Success value type
 * @template E Error type
 * @param error Error value used for the `None` branch (optional)
 * @returns A function mapping `Maybe<V>` to `Result<V, E | Nothing.Nothing>`
 *
 * @todo testing
 */
export const toResult: {
  <V, E>(self: Maybe<V>, error: Evaluable<E>): Result.Result<V, E>;
  <V>(self: Maybe<V>): Result.Result<V, Nothing.Nothing>;
  <V, E>(error: Evaluable<E>): (self: Maybe<V>) => Result.Result<V, E>;
  <V>(): (self: Maybe<V>) => Result.Result<V, Nothing.Nothing>;
} = Macro.dualify(
  1,
  <V, E>(
    self: Maybe<V>,
    error?: Evaluable<E>
  ): Result.Result<V, Nothing.Nothing> | Result.Result<V, E> => {
    if (isNone(self))
      return error ? Result.err(Macro.evaluate(error)) : Result.err(Nothing.make());
    return Result.ok(self.value);
  }
);

/**
 * Parses a JSON string inside a `Maybe<string>` using `JSON.parse`.
 * Behaves like `tryMap(JSON.parse)`.
 *
 * @param self `Maybe<string>` to parse
 * @returns `Maybe<any>` with the parsed value or `None` on failure
 *
 * @todo testing
 */
export const parseJson = (self: Maybe<string>) => tryMap(self, JSON.parse);
