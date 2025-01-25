import * as Macro from "@/macro";

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
export type ValueOf<Input extends Dictionary, K extends keyof Input> = Input[K];

/**
 * Extracts the key type from a dictionary.
 * @template {Dictionary} Input
 */
export type KeysOf<Input extends Dictionary> =
  Input extends Dictionary<infer K, any> ? K : never;

/**
 * Extracts the value type from a dictionary.
 * @template {Dictionary} D
 */
export type ValuesOf<D extends Dictionary> =
  D extends Dictionary<PropertyKey, infer V> ? V : never;

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

export const valuesOf: {
  <const A extends Dictionary>(): (input: A) => Array<ValuesOf<A>>;
  <const A extends Dictionary>(input: A): Array<ValuesOf<A>>;
} = Macro.dualify(0, <const A extends Dictionary>(input: A) => Object.values(input));

export const keysOf: {
  <const A extends Dictionary>(): (input: A) => Array<KeysOf<A>>;
  <const A extends Dictionary>(input: A): Array<KeysOf<A>>;
} = Macro.dualify(0, <const A extends Dictionary>(input: A) => Object.keys(input));

export const entriesOf: {
  <const A extends Dictionary>(): (input: A) => Array<[KeysOf<A>, ValuesOf<A>]>;
  <const A extends Dictionary>(input: A): Array<[KeysOf<A>, ValuesOf<A>]>;
} = Macro.dualify(0, <const A extends Dictionary>(input: A) => Object.entries(input));

export type Simplify<T> = { [KeyType in keyof T]: T[KeyType] } & {};
