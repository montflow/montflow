import * as Macro from "../macro/index.js";

export type Optional<T, K extends keyof T> = Simplify<Omit<T, K> & Partial<Pick<T, K>>>;

/**
 * Valid property object key types.
 */
export type PropertyKey = keyof any;

/**
 * Record type w/ default template params.
 * @template K extends PropertyKey key type. `PropertyKey` by default.
 * @template V value type `any` by default.
 * @see {@link PropertyKey}
 */
export type Dictionary<K extends PropertyKey = PropertyKey, V = any> = { [P in K]?: V };

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

/**
 * Type guard that checks if an object has the specified key.
 * @template K extends PropertyKey key type
 * @param {object} obj object to check
 * @param {K} key key to check for
 * @returns {boolean} true if key exists on object
 */
export function hasKey<T extends Dictionary, K extends PropertyKey>(
  obj: T,
  key: K
): obj is T & { [P in K]: Exclude<T[P], undefined> } {
  return key in obj && obj[key] !== undefined;
}

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

export type Simplify<T> = { [KeyType in keyof T]: T[KeyType] } & {};
