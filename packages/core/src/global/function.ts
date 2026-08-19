import type * as _Function from '../function/index.js';

/**
 * @alias {@link Function.Lazy}
 *
 * Represents a lazy evaluation.
 *
 * @template T the type of the value
 */
export type Lazy<T> = () => T;

/**
 * @alias {@link Function.Nullary}
 *
 * Represents a synchronous task to produce a value of type `T`.
 *
 * @template T the type of the value
 */
export type Sync<T> = () => T;
