import * as Macro from "../macro/index.js";
import { Dictionary, Simplify } from "../misc/index.js";

export type Optional<T, K extends keyof T> = Simplify<Omit<T, K> & Partial<Pick<T, K>>>;

/**
 * Extracts the value type for a given key from a dictionary.
 * @template {Dictionary} Input
 * @template K
 */
export type Value<Input extends Dictionary, K extends keyof Input> = Input[K];

/**
 * Extracts the key type from a dictionary.
 * @template {Dictionary} Input
 */
export type Keys<Input extends Dictionary> = Input extends Dictionary<infer K, any> ? K : never;

/**
 * Extracts the value type from a dictionary.
 * @template {Dictionary} Input
 */
export type Values<Input extends Dictionary> =
  Input extends Dictionary<PropertyKey, infer V> ? V : never;

export type Entries<Input extends Dictionary> = {
  [K in keyof Input]-?: [K, Input[K] & ({} | null | undefined)];
}[keyof Input];

export const isObject = (thing: unknown): thing is Object =>
  typeof thing === "object" && thing !== null;

export const hasKey: {
  <T extends Dictionary, K extends PropertyKey>(
    self: T,
    key: K
  ): self is T & { [P in K]: Exclude<T[P], undefined> };
  <T extends Dictionary, K extends PropertyKey>(
    key: K
  ): (self: T) => self is T & { [P in K]: Exclude<T[P], undefined> };
} = Macro.dualify(
  1,
  <T extends Dictionary, K extends PropertyKey>(
    self: T,
    key: K
  ): self is T & { [P in K]: Exclude<T[P], undefined> } =>
    key in self && self[key] !== undefined
);

export const values: {
  <const T extends Dictionary>(): (input: T) => Values<T>[];
  <const T extends Dictionary>(input: T): Values<T>[];
} = Macro.dualify(0, <const T extends Dictionary>(input: T) => Object.values(input));

export const keys: {
  <const T extends Dictionary>(): (input: T) => Keys<T>[];
  <const T extends Dictionary>(input: T): Keys<T>[];
} = Macro.dualify(0, <const T extends Dictionary>(input: T) => Object.keys(input));

export const entries: {
  <const T extends Dictionary>(): (input: T) => Entries<T>[];
  <const T extends Dictionary>(input: T): Entries<T>[];
} = Macro.dualify(0, <const T extends Dictionary>(input: T) => Object.entries(input));
