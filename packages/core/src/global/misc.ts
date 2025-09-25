/**
 * A type that can be either a value or undefined.
 *
 * @template V the type of the value
 */
export type Optional<V> = V | undefined;

/**
 * A type that can be either a value or a function that produces a value.
 *
 * @template V the type of the value
 */
export type Evaluable<V> = V | (() => V);
