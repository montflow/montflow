import * as Chain from "../chain/index.js";
import * as Function from "../function/index.js";
import { Evaluable, Missing } from "../global/index.js";
import * as Macro from "../macro/index.js";
import * as Maybe from "../maybe/index.js";
import * as Numeric from "../numberic/index.js";

/**
 * Utility type for array with at least one element
 *
 * @template T The type of the elements in the array
 */
export type NotEmpty<T> = [T, ...T[]];

export namespace NotEmpty {
  export type Any = NotEmpty<any>;

  export type Value<TArray extends Any> = TArray extends NotEmpty<infer T> ? T : never;
}

/**
 * Utility type for array with no elements
 *
 * @template T The type of the elements in the array
 */
export type Empty<T = unknown> = [];

/**
 * Utility type for array with any type
 *
 * @alias Array<any>
 */
export type Any = Array<any>;

/**
 * Utility type for array with unknown type
 *
 * @alias Array<unknown>
 */
export type Unknown = Array<unknown>;

/**
 * Utility type to extract the value type from an array
 *
 * @template TArray The type of the array
 * @returns The value type of the array
 */
export type Values<TArray extends Any> = TArray extends Array<infer T> ? T : never;

/**
 * Utility function to check if a value is an array
 *
 * @param thing The value to check
 * @returns True if the value is an array, false otherwise
 */
export const isArray = (thing: unknown): thing is Array<unknown> => Array.isArray(thing);

/**
 * Utility function to check if every value is an array of a specific type
 *
 * @param thing The value to check
 * @param guard The guard to check if the value is of the specific type
 * @returns True if the value is an array of the specific type, false otherwise
 */
export const isArrayOf: {
  <T>(thing: unknown, guard: Function.Guard<T>): thing is T[];
  <T>(guard: Function.Guard<T>): (thing: unknown) => thing is T[];
} = Macro.dualify(
  1,
  <T>(thing: unknown, guard: Function.Guard<T>): thing is T[] =>
    isArray(thing) && thing.every(guard)
);

/**
 * Utility function to check if an array is not empty
 *
 * @param array The array to check
 * @returns True if the array is not empty, false otherwise
 */
export const isNotEmpty = <T>(array: Array<T>): array is NotEmpty<T> => array.length > 0;

/**
 * Utility function to check if an array is empty
 *
 * @param array The array to check
 * @returns True if the array is empty, false otherwise
 */
export const isEmpty = <T>(array: T[]): array is Empty<T> => array.length === 0;

/**
 * Utility function to maybe get an element from an array
 *
 * @template T The type of the elements in the array
 * @param array The array to get the element from
 * @param index The index of the element to get
 * @returns {Maybe.Maybe<T>} maybe of the element at the given index
 *
 * @todo testing
 */
export const maybeGet: {
  <T>(self: Array<T>, index: number): Maybe.Maybe<T>;
  <T>(index: number): (self: Array<T>) => Maybe.Maybe<T>;
} = Macro.dualify(
  1,
  <T>(self: Array<T>, index: number): Maybe.Maybe<T> =>
    (
      isNotEmpty(self) &&
      Numeric.isInt(index) &&
      Numeric.isBetween(index, { min: 0, max: self.length - 1 })
    ) ?
      Maybe.some(self[index])
    : Maybe.none()
);

/**
 * Utility function to get the length of an array
 *
 * @param array The array to get the length of
 * @returns The length of the array
 */
export const length = (array: unknown[]): number => array.length;

/**
 * Utility function to create an empty array
 *
 * @constructor
 *
 * @param array The array to create
 * @returns The empty array
 */
export const empty = <T>(): Array<T> => [];

/**
 * Alias for the native javascript array.from method
 *
 * @alias @see {@link Array.from}
 */
export const from = Array.from;

/**
 * Utility function to create an array of a specific length
 *
 * @constructor
 *
 * @param length The length of the array
 * @param value The value to fill the array with
 * @returns The filled array
 *
 * @todo testing
 */
export const filled = <T>(length: number, value: Evaluable<T>): Array<T> =>
  from({ length }, () => Macro.evaluate(value));

/**
 * Utility function to get the first element of an array.
 *
 * @template TArray The type of the array
 * @param array The array to get the first element from
 * @returns The first element of the array, or null if the array might be empty
 *
 * @todo testing
 */
export const first = <TArray extends Any>(
  array: TArray
): TArray extends NotEmpty.Any ? Values<TArray> : Values<TArray> | Missing => array[0];

/**
 * Checks if the first element of the array exists, if so Some<T> otherwise None
 *
 * @param array The array to get the first element from
 * @returns The first element of the array, or null if the array might be empty
 *
 * @todo testing
 */
export const maybeFirst = <T>(array: Array<T>): Maybe.Maybe<T> => maybeGet(array, 0);

/**
 * Get the last index of an array
 *
 * @param array The array to get the last index from
 * @returns The last index of the array
 *
 * @todo testing
 */
export const lastIndex = (array: Any): number => array.length - 1;

/**
 * Checks if the last index of the array exists, if so Some<number> otherwise None
 *
 * @param array The array to get the last index from
 * @returns The last index of the array, or null if the array might be empty
 *
 * @todo testing
 */
export const maybeLastIndex = (array: Any): Maybe.Maybe<number> =>
  Chain.make(array, lastIndex, Maybe.fromPredicate(Numeric.isNonNegative));

/**
 * Get the last element of an array.
 *
 * @template TArray The type of the array
 * @param array The array to get the last element from
 * @returns The last element of the array, or null if the array might be empty
 *
 * @todo testing
 */
export const last = <TArray extends Any>(
  array: TArray
): TArray extends NotEmpty.Any ? Values<TArray> : Values<TArray> | Missing =>
  array[lastIndex(array)];

/**
 * Checks if the last element of the array exists, if so Some<T> otherwise None
 *
 * @param array The array to get the last element from
 * @returns The last element of the array, or null if the array might be empty
 *
 * @todo testing
 */
export const maybeLast = <T>(array: Array<T>): Maybe.Maybe<T> =>
  maybeGet(array, lastIndex(array));

/**
 * Checks if the index is the last index of the array
 *
 * @param array The array to check the last index of
 * @param index The index to check
 * @returns True if the index is the last index of the array, false otherwise
 *
 * @todo testing
 */
export const isLastIndex = (array: Any, index: number): boolean => index === array.length - 1;

/**
 * Checks if the element is the last element of the array
 *
 * @param array The array to check the last element of
 * @param element The element to check
 * @returns True if the element is the last element of the array, false otherwise
 *
 * @todo testing
 */
export const isLast: {
  <T>(self: Array<T>, element: number): boolean;
  <T>(element: T): (self: Array<T>) => boolean;
} = Macro.dualify(1, <T>(self: Array<T>, element: T): boolean =>
  Chain.make(
    maybeLast(self),
    Maybe.map(last => last === element),
    Maybe.orElse(false)
  )
);
