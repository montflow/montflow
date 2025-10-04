/**
 * @alias
 * Generic key type for objects.
 */
export type PropertyKey = keyof any;

/**
 * A dictionary type with optional keys of type `K` and values of type `V`.
 *
 * @template K The key type, extending `PropertyKey` (default: `PropertyKey`).
 * @template V The value type (default: `any`).
 * @see PropertyKey
 */
export type Dictionary<K extends PropertyKey = PropertyKey, V = any> = { [P in K]?: V };

/**
 * A dictionary type with required keys of type `K` and values of type `V`.
 *
 * @template K The key type, extending `PropertyKey` (default: `PropertyKey`).
 * @template V The value type (default: `any`).
 * @see PropertyKey
 */
export type Struct<K extends PropertyKey = PropertyKey, V = any> = {
  [P in K]: V;
};

/**
 * Forces typescript to render type in a simplified way.
 *
 * @template T The type to simplify.
 */
export type Simplify<T> = { [KeyType in keyof T]: T[KeyType] } & {};
