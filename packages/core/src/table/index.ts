import * as List from '../list/index.js';
import * as Macro from '../macro/index.js';
import { Simplify, Struct } from '../global/index.js';

/**
 * Utility type to make a property optional.
 *
 * @todo testing
 */
export type Optional<T, K extends keyof T> = Simplify<Omit<T, K> & Partial<Pick<T, K>>>;

/**
 * Extracts the value type for a given key from a dictionary.
 *
 * @template {Struct} TInput
 * @template K
 */
export type Value<TInput extends Struct, K extends keyof TInput> = TInput[K];

/**
 * Extracts the key type from a dictionary.
 *
 * @template {Struct} TInput
 */
export type Keys<TInput extends Struct> = TInput extends Struct<infer K, any> ? K : never;

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
 * @template {Struct} TInput
 *
 * @todo testing
 */
export type Values<TInput extends Struct> = TInput extends Struct<PropertyKey, infer V> ? V : never;

/**
 * Extracts the entries type from a dictionary.
 *
 * @template {Struct} TInput
 *
 * @todo testing
 */
export type Entries<TInput extends Struct> = {
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
  typeof thing === 'object' && thing !== null;

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
export const isTable = (thing: unknown): thing is Struct => isObject(thing);

/**
 * Checks if an object has a given key.
 *
 * @template T The object type to check
 * @template K The key to check for
 *
 * @todo testing
 */
export const hasKey: {
  <T extends Struct, K extends PropertyKey>(
    self: T,
    key: K,
  ): self is T & { [P in K]: Exclude<T[P], undefined> };
  <T extends Struct, K extends PropertyKey>(
    key: K,
  ): (self: T) => self is T & { [P in K]: Exclude<T[P], undefined> };
} = Macro.dualify(
  1,
  <T extends Struct, K extends PropertyKey>(
    self: T,
    key: K,
  ): self is T & { [P in K]: Exclude<T[P], undefined> } => key in self && self[key] !== undefined,
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
  <T extends Struct, K extends PropertyKey>(
    self: T,
    keys: readonly K[],
  ): self is T & { [P in K]: Exclude<T[P], undefined> };
  <T extends Struct, K extends PropertyKey>(
    keys: readonly K[],
  ): (self: T) => self is T & { [P in K]: Exclude<T[P], undefined> };
} = Macro.dualify(
  1,
  <T extends Struct, K extends PropertyKey>(
    self: T,
    keys: readonly K[],
  ): self is T & { [P in K]: Exclude<T[P], undefined> } =>
    keys.every((key) => key in self && self[key] !== undefined),
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
export const values = <const T extends Struct>(input: T) =>
  // SAFETY: Object.values on a Struct<T> yields exactly its Values<T> members.
  Object.values(input) as Values<T>[];

/**
 * Returns possible keys of a table.
 *
 * @template T The table type to get keys from
 * @param input The table to get keys from
 * @returns The keys of the table
 *
 * @todo testing
 */
export const keys = <const T extends Struct>(input: T) =>
  // SAFETY: Object.keys on a Struct<T> yields exactly its Keys<T>.
  Object.keys(input) as Keys<T>[];

/**
 * Returns the size of a table. (how many keys are in the table)
 *
 * @template T The table type to get the size of
 * @param input The table to get the size of
 * @returns The size of the table
 *
 * @todo testing
 */
export const size = <const T extends Struct>(input: T) => keys(input).length;

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
export const entries = <const T extends Struct>(input: T) =>
  // SAFETY: Object.entries on a Struct<T> yields its Entries<T> pairs.
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
    keys: readonly K[],
  ): Pick<TInput, K>;
  <TInput extends Record<PropertyKey, any>, K extends keyof TInput>(
    keys: readonly K[],
  ): (self: TInput) => Pick<TInput, K>;
} = Macro.dualify(
  1,
  <TInput extends Record<PropertyKey, any>, K extends keyof TInput>(
    self: TInput,
    keys: readonly K[],
  ): Pick<TInput, K> => {
    // SAFETY: result is populated only from self's own picked keys, so it
    // satisfies Pick<TInput, K>.
    const result = {} as Pick<TInput, K>;
    for (const key of keys) {
      if (key in self) {
        result[key] = self[key];
      }
    }
    return result;
  },
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
    keys: readonly K[],
  ): Omit<TInput, K>;
  <TInput extends Record<PropertyKey, any>, K extends keyof TInput>(
    keys: readonly K[],
  ): (self: TInput) => Omit<TInput, K>;
} = Macro.dualify(
  1,
  <TInput extends Record<PropertyKey, any>, K extends keyof TInput>(
    self: TInput,
    keys: readonly K[],
  ): Omit<TInput, K> => {
    // SAFETY: result starts as a full copy of self, so it satisfies
    // Omit<TInput, K>.
    const result = { ...self } as Omit<TInput, K>;
    for (const key of keys) {
      // SAFETY: deleted keys are from keyof TInput and exist on the copy; the
      // cast bypasses delete's restriction on Omit-typed keys.
      delete (result as any)[key];
    }
    return result;
  },
);

/**
 * Generates a unique key given a struct. Always produces the same output for the same input.
 *
 * @param struct The struct to generate a key for
 * @returns A deterministic string key representing the struct
 * @throw {TypeError} If the input or its nested structures are not serializable
 */
export const keyefy = (struct: Struct): string => {
  // Inline flattening logic to avoid deep type instantiation with Flatten<Struct>
  const result: Record<string, unknown> = {};

  const isPrimitive = (value: unknown): boolean =>
    value === null ||
    typeof value !== 'object' ||
    value instanceof Date ||
    value instanceof Function;

  const isNumericKey = (key: string): boolean => /^\d+$/.test(key);

  const recurse = (obj: object, prefix: string): void => {
    const isArrayLike = List.isArray(obj);

    for (const [key, value] of Object.entries(obj)) {
      // For arrays, only include numeric indices
      if (isArrayLike && !isNumericKey(key)) {
        continue;
      }

      const newKey = prefix ? `${prefix}.${key}` : key;

      if (isPrimitive(value)) {
        result[newKey] = value;
      } else {
        // SAFETY: isPrimitive(value) is false, so value is a plain object or
        // array (null, Date, and Function are primitive by the check above).
        recurse(value as object, newKey);
      }
    }
  };

  recurse(struct, '');
  const flattened = result;
  const sortedKeys = Object.keys(flattened).sort();

  const serializedEntries = sortedKeys.map((key) => {
    const value = flattened[key];

    // Handle non-serializable values
    if (typeof value === 'symbol') {
      throw new TypeError(`Cannot serialize symbol at key "${key}"`);
    }
    if (typeof value === 'bigint') {
      throw new TypeError(`Cannot serialize bigint at key "${key}"`);
    }
    if (typeof value === 'function') {
      throw new TypeError(`Cannot serialize function at key "${key}"`);
    }

    // Handle Date objects by converting to ISO string
    if (value instanceof Date) {
      return [key, value.toISOString()];
    }

    return [key, value];
  });

  try {
    return JSON.stringify(Object.fromEntries(serializedEntries));
  } catch (error) {
    if (error instanceof TypeError) {
      throw error;
    }
    throw new TypeError(
      `Failed to serialize struct: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

/**
 * Gets the valid keys for a type, filtering out array/function methods.
 */
type ValidKeys<T> = T extends readonly any[]
  ? keyof T & `${number}`
  : T extends Function
    ? never
    : keyof T & (string | number);

/**
 * Flattens a nested object type into a single-level object with dot-notation keys.
 *
 * @template T The object type to flatten
 * @template TPrefix Internal prefix for recursion (do not provide)
 *
 * @example
 * type Input = { a: 1, b: { x: 10, y: false }, c: [1, 2] };
 * type Output = Flatten<Input>;
 * // { a: 1, "b.x": 10, "b.y": false, "c.0": 1, "c.1": 2 }
 *
 * @todo testing
 */
export type Flatten<T, TPrefix extends string = ''> = T extends
  | string
  | number
  | boolean
  | null
  | undefined
  | symbol
  | bigint
  | Function
  | Date
  ? {}
  : Simplify<
      {
        [
          K in ValidKeys<T> as T[K] extends
            | string
            | number
            | boolean
            | null
            | undefined
            | symbol
            | bigint
            | Function
            | Date
            ? TPrefix extends ''
              ? `${K}`
              : `${TPrefix}.${K}`
            : never
        ]: T[K];
      } & ({
        [K in ValidKeys<T>]: T[K] extends
          | string
          | number
          | boolean
          | null
          | undefined
          | symbol
          | bigint
          | Function
          | Date
          ? {}
          : Flatten<T[K], TPrefix extends '' ? `${K}` : `${TPrefix}.${K}`>;
      }[ValidKeys<T>] extends infer U
        ? (U extends any ? (k: U) => void : never) extends (k: infer I) => void
          ? I
          : never
        : never)
    >;

/**
 * Flattens a nested object into a single-level object with dot-notation keys.
 *
 * @template TObject The object type to flatten
 * @param struct The object to flatten
 * @returns A flattened object with dot-notation keys
 *
 * @example
 * const obj = { a: 1, b: { x: 10 }, c: [1, 2] };
 * const flat = flatten(obj);
 * // { a: 1, "b.x": 10, "c.0": 1, "c.1": 2 }
 */
export const flatten = <const TObject extends object>(struct: TObject): Flatten<TObject> => {
  const result: Record<string, unknown> = {};

  const isPrimitive = (value: unknown): boolean =>
    value === null ||
    typeof value !== 'object' ||
    value instanceof Date ||
    value instanceof Function;

  const isNumericKey = (key: string): boolean => /^\d+$/.test(key);

  const recurse = (obj: object, prefix: string): void => {
    const isArrayLike = List.isArray(obj);

    for (const [key, value] of Object.entries(obj)) {
      // For arrays, only include numeric indices
      if (isArrayLike && !isNumericKey(key)) {
        continue;
      }

      const newKey = prefix ? `${prefix}.${key}` : key;

      if (isPrimitive(value)) {
        result[newKey] = value;
      } else {
        // SAFETY: isPrimitive(value) is false, so value is a plain object or
        // array (null, Date, and Function are primitive by the check above).
        recurse(value as object, newKey);
      }
    }
  };

  recurse(struct, '');
  return Macro.cast<Flatten<TObject>>(result);
};
