export type Optional<V> = V | undefined;
export type Evaluable<V> = V | (() => V);
export type Simplify<T> = { [KeyType in keyof T]: T[KeyType] } & {};
