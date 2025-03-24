export type Optional<V> = V | undefined;
export type Evaluable<V> = V | (() => V);
export type Simplify<T> = { [KeyType in keyof T]: T[KeyType] } & {};
export type Lazy<T> = () => T;
export type Sync<T> = () => T;

/**
 * @alias
 * Generic key type for objects.
 */
export type PropertyKey = keyof any;

/**
 * A dictionary type with optional keys of type `K` and values of type `V`.
 *
 * @template K - The key type, extending `PropertyKey` (default: `PropertyKey`).
 * @template V - The value type (default: `any`).
 * @see PropertyKey
 */
export type Dictionary<K extends PropertyKey = PropertyKey, V = any> = { [P in K]?: V };

export type Table<K extends PropertyKey = PropertyKey, V = any> = {
  [P in K]: V;
};

export type Constructor = new (...args: any[]) => any;
export type ConstructorOf<Of = {}> = new (...args: any[]) => Of;

export type InstanceOf<TConstructor extends ConstructorOf<any>> =
  TConstructor extends ConstructorOf<infer I> ? I : never;
