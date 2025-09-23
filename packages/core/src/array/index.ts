import { Evaluable } from "src/global/misc.js";
import * as Function from "../function/index.js";
import * as Macro from "../macro/index.js";
import * as Maybe from "../maybe/index.js";
import * as Number from "../number/index.js";

/**
 * Type alias for the native javascript array type
 */
export const Constructor = Array;

/**
 * Utility type for array with at least one element
 *
 * @template T The type of the elements in the array
 */
export type NotEmpty<T> = [T, ...T[]];

/**
 * Utility type for array with no elements
 *
 * @template T The type of the elements in the array
 */
export type Empty<T = unknown> = [];

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
 * Utility function to get an element from an array
 *
 * @param array The array to get the element from
 * @param index The index of the element to get
 * @returns The element at the given index
 */
export const maybeGet = <T>(array: Array<T>, index: number): Maybe.Maybe<T> =>
  Number.isInt(index) && Number.isBetween(index, { min: 0, max: array.length - 1 }) ?
    Maybe.some(array[index])
  : Maybe.none();

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
 */
export const filled = <T>(length: number, value: Evaluable<T>): Array<T> =>
  from({ length }, () => Macro.evaluate(value));
