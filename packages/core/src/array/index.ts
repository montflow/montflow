import { Guard } from "../function";

/**
 * Checks if a value is an array using Array.isArray.
 * @param {unknown} thing value to check
 * @returns {boolean} true if the value is an array false otherwise
 * @see Array.isArray
 */
export function isArray(thing: unknown): thing is Array<unknown> {
  return Array.isArray(thing);
}

/**
 * Asserts that all elements in an array satisfy the given type guard.
 * @template T type being checked
 * @param {unknown[]} arr array to check
 * @param {Guard<T>} guard type guard function to verify each element
 * @returns {boolean} true if all elements satisfy the guard false otherwise
 */
export function isArrayOf<T>(arr: unknown[], guard: Guard<T>): arr is T[] {
  return isArray(arr) && arr.every(guard);
}
