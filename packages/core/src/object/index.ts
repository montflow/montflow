import { Simplify, Table } from "../global/index.js";

import * as Macro from "../macro/index.js";

/**
 * @todo documentation
 */
export const Constructor = Object;

/**
 * @todo documentation
 */
export type Optional<T, K extends keyof T> = Simplify<Omit<T, K> & Partial<Pick<T, K>>>;

/**
 * Extracts the value type for a given key from a dictionary.
 * @template {Table} Input
 * @template K
 */
export type Value<Input extends Table, K extends keyof Input> = Input[K];

/**
 * Extracts the key type from a dictionary.
 * @template {Table} Input
 */
export type Keys<Input extends Table> = Input extends Table<infer K, any> ? K : never;

/**
 * @todo documentation
 */
export type IsEmpty<T> = keyof T extends never ? false : true;

/**
 * Extracts the value type from a dictionary.
 * @template {Table} Input
 */
export type Values<Input extends Table> = Input extends Table<PropertyKey, infer V> ? V : never;

/**
 * @todo documentation
 */
export type Entries<Input extends Table> = {
  [K in keyof Input]-?: [K, Input[K]];
}[keyof Input];

/**
 * @todo documentation
 * @todo testing
 */
export const isObject = (thing: unknown): thing is object =>
  typeof thing === "object" && thing !== null;

/**
 * @todo documentation
 * @todo testing
 */
export const isTable = (thing: unknown): thing is Table => isObject(thing);

/**
 * @todo documentation
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
 * @todo documentation
 * @todo testing
 */
export const values = <const T extends Table>(input: T) => Object.values(input) as Values<T>[];

/**
 * @todo documentation
 * @todo testing
 */
export const keys = <const T extends Table>(input: T) => Object.keys(input) as Keys<T>[];

/**
 * @todo documentation
 * @todo testing
 */
export const length = <const T extends Table>(input: T) => keys(input).length;

/**
 * @todo documentation
 * @todo testing
 */
export const entries = <const T extends Table>(input: T) =>
  Object.entries(input) as Entries<T>[];
