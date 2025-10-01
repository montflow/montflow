import { Simplify, Table } from "../global/index.js";
import * as Macro from "../macro/index.js";

/**
 * Alias for the native `Object` constructor.
 */
export const Constructor = Object;

/**
 * Utility type to make a property optional.
 *
 * @todo testing
 */
export type Optional<T, K extends keyof T> = Simplify<Omit<T, K> & Partial<Pick<T, K>>>;

/**
 * Extracts the value type for a given key from a dictionary.
 *
 * @template {Table} TInput
 * @template K
 */
export type Value<TInput extends Table, K extends keyof TInput> = TInput[K];

/**
 * Extracts the key type from a dictionary.
 *
 * @template {Table} TInput
 */
export type Keys<TInput extends Table> = TInput extends Table<infer K, any> ? K : never;

/**
 * Asserts if an object is empty.
 *
 * @template T The object type to check
 *
 * @todo testing
 */
export type IsEmpty<T> = keyof T extends never ? false : true;

/**
 * Extracts the value type from a dictionary.
 *
 * @template {Table} TInput
 *
 * @todo testing
 */
export type Values<TInput extends Table> =
  TInput extends Table<PropertyKey, infer V> ? V : never;

/**
 * Extracts the entries type from a dictionary.
 *
 * @template {Table} TInput
 *
 * @todo testing
 */
export type Entries<TInput extends Table> = {
  [K in keyof TInput]-?: [K, TInput[K]];
}[keyof TInput];

/**
 * Checks if a value is an object.
 *
 * @param thing The value to check
 * @returns True if the value is an object
 *
 * @todo testing
 */
export const isObject = (thing: unknown): thing is object =>
  typeof thing === "object" && thing !== null;

/**
 * Checks if a value is a table.
 *
 *
 * @param thing The value to check
 * @returns True if the value is a table
 *
 * @alias {@link isObject}
 *
 * @todo testing
 */
export const isTable = (thing: unknown): thing is Table => isObject(thing);

/**
 * Checks if an object has a given key.
 *
 * @template T The object type to check
 * @template K The key to check for
 *
 * @todo testing
 */
export const hasKey: {
  <T extends Table, K extends PropertyKey>(
    self: T,
    key: K
  ): self is T & { [P in K]: Exclude<T[P], undefined> };
  <T extends Table, K extends PropertyKey>(
    key: K
  ): (self: T) => self is T & { [P in K]: Exclude<T[P], undefined> };
} = Macro.dualify(
  1,
  <T extends Table, K extends PropertyKey>(
    self: T,
    key: K
  ): self is T & { [P in K]: Exclude<T[P], undefined> } =>
    key in self && self[key] !== undefined
);

/**
 * Checks if an object has all the specified keys with non-undefined values
 *
 * @template T The object type to check
 * @template K The keys to check for
 * @param self The object to check
 * @param keys Array of keys to verify exist
 * @returns True if all keys exist with non-undefined values
 *
 * @todo testing
 */
export const hasKeys: {
  <T extends Table, K extends PropertyKey>(
    self: T,
    keys: readonly K[]
  ): self is T & { [P in K]: Exclude<T[P], undefined> };
  <T extends Table, K extends PropertyKey>(
    keys: readonly K[]
  ): (self: T) => self is T & { [P in K]: Exclude<T[P], undefined> };
} = Macro.dualify(
  1,
  <T extends Table, K extends PropertyKey>(
    self: T,
    keys: readonly K[]
  ): self is T & { [P in K]: Exclude<T[P], undefined> } =>
    keys.every(key => key in self && self[key] !== undefined)
);

/**
 * Returns possible values of a table.
 *
 * @template T The table type to get values from
 * @param input The table to get values from
 * @returns The values of the table
 *
 * @todo testing
 */
export const values = <const T extends Table>(input: T) => Object.values(input) as Values<T>[];

/**
 * Returns possible keys of a table.
 *
 * @template T The table type to get keys from
 * @param input The table to get keys from
 * @returns The keys of the table
 *
 * @todo testing
 */
export const keys = <const T extends Table>(input: T) => Object.keys(input) as Keys<T>[];

/**
 * Returns the size of a table. (how many keys are in the table)
 *
 * @template T The table type to get the size of
 * @param input The table to get the size of
 * @returns The size of the table
 *
 * @todo testing
 */
export const size = <const T extends Table>(input: T) => keys(input).length;

/**
 * Alias for {@link size}.
 */
export const length = size;

/**
 * Returns the entries of a table.
 *
 * @template T The table type to get the entries from
 * @param input The table to get the entries from
 * @returns The entries of the table
 *
 * @todo testing
 */
export const entries = <const T extends Table>(input: T) =>
  Object.entries(input) as Entries<T>[];

/**
 * Creates a new object with only the specified keys from the input object.
 *
 * @template TInput The input object type
 * @template K The keys to pick from the input object
 * @param self The object to pick keys from
 * @param keys Array of keys to pick from the object
 * @returns A new object containing only the specified keys
 */
export const pick: {
  <TInput extends Record<PropertyKey, any>, K extends keyof TInput>(
    self: TInput,
    keys: readonly K[]
  ): Pick<TInput, K>;
  <TInput extends Record<PropertyKey, any>, K extends keyof TInput>(
    keys: readonly K[]
  ): (self: TInput) => Pick<TInput, K>;
} = Macro.dualify(
  1,
  <TInput extends Record<PropertyKey, any>, K extends keyof TInput>(
    self: TInput,
    keys: readonly K[]
  ): Pick<TInput, K> => {
    const result = {} as Pick<TInput, K>;
    for (const key of keys) {
      if (key in self) {
        result[key] = self[key];
      }
    }
    return result;
  }
);

/**
 * Creates a new object with all keys except the specified ones from the input object.
 *
 * @template TInput The input object type
 * @template K The keys to omit from the input object
 * @param self The object to omit keys from
 * @param keys Array of keys to omit from the object
 * @returns A new object without the specified keys
 */
export const omit: {
  <TInput extends Record<PropertyKey, any>, K extends keyof TInput>(
    self: TInput,
    keys: readonly K[]
  ): Omit<TInput, K>;
  <TInput extends Record<PropertyKey, any>, K extends keyof TInput>(
    keys: readonly K[]
  ): (self: TInput) => Omit<TInput, K>;
} = Macro.dualify(
  1,
  <TInput extends Record<PropertyKey, any>, K extends keyof TInput>(
    self: TInput,
    keys: readonly K[]
  ): Omit<TInput, K> => {
    const result = { ...self } as Omit<TInput, K>;
    for (const key of keys) {
      delete (result as any)[key];
    }
    return result;
  }
);
