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
export type Dictionary<K extends PropertyKey = PropertyKey, V = any> = Record<K, V>;

export namespace Dictionary {
  /**
   * Generic record type with any value.
   */
  export type Any = Dictionary<PropertyKey, any>;
}

/**
 * Extracts the value type for a given key from a dictionary.
 * @template D extends Dictionary dictionary type
 * @template K extends keyof D key type
 */
export type ValueOf<D extends Dictionary, K extends keyof D> = D[K];

/**
 * Extracts the key type from a dictionary.
 * @template D extends Dictionary dictionary type
 */
export type KeysOf<D extends Dictionary> = D extends Dictionary<infer K, any> ? K : never;

/**
 * Extracts the value type from a dictionary.
 * @template D extends Dictionary dictionary type
 */
export type ValuesOf<D extends Dictionary> =
  D extends Dictionary<PropertyKey, infer V> ? V : never;

/**
 * Returns an array containing the values of an object.
 * Type-safe alternative to `Object.values()`.
 *
 * @template O - The object type
 * @param {O} obj - The source object
 * @returns {Array<ValuesOf<O>>} An array containing the values of the object
 *
 * @example
 * const obj = { a: 1, b: "hello", c: true };
 * const values = valuesOf(obj); // Array<number | string | boolean>
 */
export function valuesOf<O extends object>(obj: O): Array<ValuesOf<O>> {
  return Object.values(obj);
}

/**
 * Returns an array containing the keys of an object.
 * Type-safe alternative to `Object.keys()`.
 *
 * @template O - The object type
 * @param {O} obj - The source object
 * @returns {Array<KeysOf<O>>} An array containing the keys of the object
 *
 * @example
 * const obj = { a: 1, b: "hello", c: true };
 * const keys = keysOf(obj); // Array<"a" | "b" | "c">
 */
export function keysOf<O extends object>(obj: O): Array<KeysOf<O>> {
  return Object.keys(obj) as Array<KeysOf<O>>;
}

/**
 * Returns an array containing the key-value pairs of an object.
 * Type-safe alternative to `Object.entries()`.
 *
 * @template O - The object type
 * @param {O} obj - The source object
 * @returns {Array<[KeysOf<O>, ValuesOf<O>]>} An array containing the key-value pairs of the object
 *
 * @example
 * const obj = { a: 1, b: "hello" };
 * const entries = entriesOf(obj); // Array<["a" | "b", number | string]>
 */
export function entriesOf<O extends object>(obj: O): Array<[KeysOf<O>, ValuesOf<O>]> {
  return Object.entries(obj) as Array<[KeysOf<O>, ValuesOf<O>]>;
}
