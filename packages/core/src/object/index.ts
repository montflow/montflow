/**
 * Checks if a value is a non null object.
 * @param {unknown} thing value to check
 * @returns {boolean} true if value is an object and not null
 */
export function isObject(thing: unknown): thing is Object {
  return typeof thing === "object" && thing !== null;
}

/**
 * Type guard that checks if an object has the specified key.
 * @template K extends PropertyKey key type
 * @param {object} obj object to check
 * @param {K} key key to check for
 * @returns {boolean} true if key exists on object
 */
export function hasKey<K extends PropertyKey>(obj: object, key: K): key is keyof typeof obj {
  return key in obj;
}
