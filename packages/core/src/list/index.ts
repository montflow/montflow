import * as Array from "@/array";

/**
 * Represents a typed list extending the Array type with a discriminator.
 * @template T type of elements in the list
 */
export interface List<T> extends Iterable<T> {
  kind: "list";
}

/**
 * Creates an empty List.
 * @template T type of elements in the list
 * @returns {List<T>} a new empty list
 */
export function List<T>(): List<T>;

/**
 * Creates a List from an Array.
 * @template T type of elements in the list
 * @param {Array<T>} array source array
 * @returns {List<T>} a new list containing the array elements
 */
export function List<T>(array: Array<T>): List<T>;

/**
 * Creates a List from a Set.
 * @template T type of elements in the list
 * @param {Set<T>} set source set
 * @returns {List<T>} a new list containing the set elements
 */
export function List<T>(set: Set<T>): List<T>;

/**
 * Creates a List from a Map.
 * @template K type of keys in the map
 * @template V type of values in the map
 * @param {Map<K,V>} map source map
 * @returns {List<[K,V]>} a new list containing key value pairs
 */
export function List<K, V>(map: Map<K, V>): List<[K, V]>;

/**
 * Creates a List from a Record.
 * @template K type of keys in the record extending PropertyKey
 * @template V type of values in the record
 * @param {Record<K,V>} record source record
 * @returns {List<[K,V]>} a new list containing key value pairs
 */
export function List<K extends PropertyKey, V>(record: Record<K, V>): List<[K, V]>;

/** @internal */
export function List<T extends PropertyKey, V>(
  iterable?: Array<T> | Set<T> | Map<T, V> | Record<T, V>
): List<T> | List<[T, V]> {
  if (iterable === undefined) {
    return Object.assign([], { kind: "list" }) as List<T>;
  }

  if (Array.isArray(iterable)) return FromArray(iterable);

  if (iterable instanceof Set) return FromSet(iterable);

  if (iterable instanceof Map) return FromMap(iterable);

  return FromRecord(iterable);
}

/**
 * Creates an empty List.
 * @template T type of elements in the list
 * @returns {List<T>} a new empty list
 */
export function FromNothing<T>(): List<T> {
  return Object.assign([], { kind: "list" }) as List<T>;
}

/**
 * Creates a List from an Array.
 * @template T type of elements in the list
 * @param {Array<T>} array source array
 * @returns {List<T>} a new list containing the array elements
 */
export function FromArray<T>(array: Array<T>): List<T> {
  return Object.assign([...array], { kind: "list" }) as List<T>;
}

/**
 * Creates a List from a Set.
 * @template T type of elements in the list
 * @param {Set<T>} set source set
 * @returns {List<T>} a new list containing the set elements
 */
export function FromSet<T>(set: Set<T>): List<T> {
  return Object.assign([...set], { kind: "list" }) as List<T>;
}

/**
 * Creates a List from a Map.
 * @template K type of keys in the map
 * @template V type of values in the map
 * @param {Map<K,V>} map source map
 * @returns {List<[K,V]>} a new list containing key value pairs
 */
export function FromMap<K, V>(map: Map<K, V>): List<[K, V]> {
  return Object.assign([...map], { kind: "list" }) as List<[K, V]>;
}

/**
 * Creates a List from a Record.
 * @template K type of keys in the record extending PropertyKey
 * @template V type of values in the record
 * @param {Record<K,V>} record source record
 * @returns {List<[K,V]>} a new list containing key value pairs
 */
export function FromRecord<K extends PropertyKey, V>(record: Record<K, V>): List<[K, V]> {
  const entries = Object.entries(record) as [K, V][];
  return Object.assign(entries, { kind: "list" }) as List<[K, V]>;
}
