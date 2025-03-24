import { Simplify, Table } from "../common/index.js";
import * as Macro from "../macro/index.js";

export const Constructor = Object;

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

export type IsEmpty<T> = keyof T extends never ? false : true;

/**
 * Extracts the value type from a dictionary.
 * @template {Table} Input
 */
export type Values<Input extends Table> = Input extends Table<PropertyKey, infer V> ? V : never;

export type Entries<Input extends Table> = {
  [K in keyof Input]-?: [K, Input[K]];
}[keyof Input];

export const isObject = (thing: unknown): thing is Object =>
  typeof thing === "object" && thing !== null;

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

export const values = <const T extends Table>(input: T) => Object.values(input) as Values<T>[];

export const keys = <const T extends Table>(input: T) => Object.keys(input) as Keys<T>[];

export const entries = <const T extends Table>(input: T) =>
  Object.entries(input) as Entries<T>[];
