import { isArray, sort } from 'effect/Array';
import { cast, dual } from 'effect/Function';
import { String as StringOrder } from 'effect/Order';
import { isBigInt, isDate, isFunction, isObjectKeyword, isSymbol } from 'effect/Predicate';
import { fromEntries, toEntries } from 'effect/Record';
import type { ReadonlyRecord } from 'effect/Record';
import type { Simplify } from 'effect/Types';

/**
 * Makes the keys `K` of `T` optional while leaving the remaining keys untouched.
 *
 * @template T The object type to relax
 * @template K The keys of `T` to make optional
 */
export type Optional<T, K extends keyof T> = Simplify<Omit<T, K> & Partial<Pick<T, K>>>;

/**
 * Extracts the value type stored at key `K` of `TInput`.
 *
 * @template TInput The object type to read from
 * @template K The key whose value type is extracted
 */
export type Value<TInput extends object, K extends keyof TInput> = TInput[K];

/**
 * Extracts the union of the key types of `TInput`.
 *
 * @template TInput The object type to read keys from
 */
export type Keys<TInput extends object> = keyof TInput;

/**
 * Asserts whether `T` has no keys.
 *
 * @template T The object type to check
 */
export type IsEmpty<T> = keyof T extends never ? true : false;

/**
 * Extracts the union of the value types of `TInput`.
 *
 * @template TInput The object type to read values from
 */
export type Values<TInput extends object> = TInput[keyof TInput];

/**
 * Extracts the union of `[key, value]` entry types of `TInput`.
 *
 * @template TInput The object type to read entries from
 */
export type Entries<TInput extends object> = {
  [K in keyof TInput]-?: [K, TInput[K]];
}[keyof TInput];

type ValidKeys<T> = T extends readonly unknown[]
  ? keyof T & `${number}`
  : T extends Function
    ? never
    : keyof T & (string | number);

/**
 * Flattens a nested object type into a single level keyed by dot notation.
 *
 * @template T The object type to flatten
 * @template TPrefix Internal accumulator for the dotted key prefix
 */
export type Flatten<T, TPrefix extends string = ''> = T extends
  | string
  | number
  | boolean
  | null
  | undefined
  | symbol
  | bigint
  | Function
  | Date
  ? {}
  : Simplify<
      {
        [
          K in ValidKeys<T> as T[K] extends
            | string
            | number
            | boolean
            | null
            | undefined
            | symbol
            | bigint
            | Function
            | Date
            ? TPrefix extends ''
              ? `${K}`
              : `${TPrefix}.${K}`
            : never
        ]: T[K];
      } & ({
        [K in ValidKeys<T>]: T[K] extends
          | string
          | number
          | boolean
          | null
          | undefined
          | symbol
          | bigint
          | Function
          | Date
          ? {}
          : Flatten<T[K], TPrefix extends '' ? `${K}` : `${TPrefix}.${K}`>;
      }[ValidKeys<T>] extends infer U
        ? (U extends unknown ? (value: U) => void : never) extends (value: infer I) => void
          ? I
          : never
        : never)
    >;

type Entry = readonly [string, unknown];

const isNumericKey = (key: string): boolean => /^\d+$/.test(key);

const isPrimitive = (value: unknown): boolean =>
  !isObjectKeyword(value) || isDate(value) || isFunction(value);

const entriesOf = (self: object): Array<Entry> =>
  toEntries(cast<object, ReadonlyRecord<string, unknown>>(self));

const flattenToRecord = (self: object): Record<string, unknown> => {
  const result: Record<string, unknown> = {};

  const recurse = (current: object, prefix: string): void => {
    const arrayLike = isArray(current);

    for (const [key, value] of entriesOf(current)) {
      if (arrayLike && !isNumericKey(key)) continue;

      const nextKey = prefix ? `${prefix}.${key}` : key;

      if (isPrimitive(value)) result[nextKey] = value;
      else recurse(cast<unknown, object>(value), nextKey);
    }
  };

  recurse(self, '');
  return result;
};

/**
 * Creates a new object containing only the specified keys. Keys absent from the
 * input are silently ignored.
 *
 * @template S The object type to pick keys from
 * @template Ks The keys to pick
 * @param self The object to pick keys from
 * @param keys The keys to pick
 */
export const pick: {
  <const Ks extends ReadonlyArray<PropertyKey>>(
    keys: Ks,
  ): <S extends object>(self: S) => Pick<S, Extract<Ks[number], keyof S>>;
  <S extends object, const Ks extends ReadonlyArray<keyof S>>(
    self: S,
    keys: Ks,
  ): Pick<S, Ks[number]>;
} = dual(
  2,
  <S extends object, const Ks extends ReadonlyArray<keyof S>>(
    self: S,
    keys: Ks,
  ): Pick<S, Ks[number]> => {
    const result: Partial<S> = {};

    for (const key of keys) {
      if (key in self) {
        result[key] = self[key];
      }
    }

    return cast<Partial<S>, Pick<S, Ks[number]>>(result);
  },
);

/**
 * Creates a new object with the specified keys removed. Keys absent from the
 * input are silently ignored.
 *
 * @template S The object type to omit keys from
 * @template Ks The keys to omit
 * @param self The object to omit keys from
 * @param keys The keys to omit
 */
export const omit: {
  <const Ks extends ReadonlyArray<PropertyKey>>(
    keys: Ks,
  ): <S extends object>(self: S) => Omit<S, Extract<Ks[number], keyof S>>;
  <S extends object, const Ks extends ReadonlyArray<keyof S>>(
    self: S,
    keys: Ks,
  ): Omit<S, Ks[number]>;
} = dual(
  2,
  <S extends object, const Ks extends ReadonlyArray<keyof S>>(
    self: S,
    keys: Ks,
  ): Omit<S, Ks[number]> => {
    const result: Partial<S> = { ...self };

    for (const key of keys) {
      delete result[key];
    }

    return cast<Partial<S>, Omit<S, Ks[number]>>(result);
  },
);

type HasKeysRefinement<T extends object, K extends PropertyKey> = T & {
  [P in K]: P extends keyof T ? Exclude<T[P], undefined> : unknown;
};

/**
 * Checks whether every specified key exists on the object with a non-undefined
 * value.
 *
 * @template S The object type to check
 * @template Ks The keys to verify
 * @param self The object to check
 * @param keys The keys to verify
 */
export const hasKeys: {
  <const Ks extends ReadonlyArray<PropertyKey>>(
    keys: Ks,
  ): <S extends object>(self: S) => self is HasKeysRefinement<S, Extract<Ks[number], keyof S>>;
  <S extends object, const Ks extends ReadonlyArray<PropertyKey>>(
    self: S,
    keys: Ks,
  ): self is HasKeysRefinement<S, Ks[number]>;
} = dual(
  2,
  <S extends object, const Ks extends ReadonlyArray<PropertyKey>>(
    self: S,
    keys: Ks,
  ): self is HasKeysRefinement<S, Ks[number]> => {
    const record = cast<S, Record<PropertyKey, unknown>>(self);
    return keys.every((key) => key in record && record[key] !== undefined);
  },
);

/**
 * Flattens a nested object into a single level keyed by dot notation. Array
 * entries use their numeric indices; `Date` and functions are treated as
 * leaves.
 *
 * @template T The object type to flatten
 * @param struct The object to flatten
 */
export const flatten = <const T extends object>(struct: T): Flatten<T> =>
  cast<Record<string, unknown>, Flatten<T>>(flattenToRecord(struct));

/**
 * Generates a deterministic string key from a nested struct. The struct is
 * flattened, its keys are sorted, and non-serializable leaves throw a
 * `TypeError`.
 *
 * @param struct The struct to generate a key for
 * @throws {TypeError} When a leaf cannot be serialized
 */
export const keyefy = (struct: object): string => {
  const flattened = flattenToRecord(struct);
  const sortedKeys = sort(StringOrder)(Object.keys(flattened));

  const serializedEntries = sortedKeys.map((key) => {
    const value = flattened[key];

    if (isSymbol(value)) {
      throw new TypeError(`Cannot serialize symbol at key "${key}"`);
    }

    if (isBigInt(value)) {
      throw new TypeError(`Cannot serialize bigint at key "${key}"`);
    }

    if (isFunction(value)) {
      throw new TypeError(`Cannot serialize function at key "${key}"`);
    }

    if (isDate(value)) {
      return [key, value.toISOString()] as const;
    }

    return [key, value] as const;
  });

  try {
    return JSON.stringify(fromEntries(serializedEntries));
  } catch (error) {
    if (error instanceof TypeError) {
      throw error;
    }

    throw new TypeError(
      `Failed to serialize struct: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
};
