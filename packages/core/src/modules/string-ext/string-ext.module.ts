import { includes } from 'effect/String';

/**
 * Type-level check for the empty string.
 *
 * @template T The string type to check
 * @returns `true` when the string type is empty, otherwise `false`
 */
export type IsEmpty<T extends string> = T extends '' ? true : false;

/**
 * Type-level check for a non-empty string.
 *
 * @template T The string type to check
 * @returns `true` when the string type is not empty, otherwise `false`
 */
export type IsNotEmpty<T extends string> = T extends '' ? false : true;

/**
 * Type-level check for a string containing a space.
 *
 * @template T The string type to check
 * @returns `true` when the string type contains a space, otherwise `false`
 */
export type HasSpaces<T extends string> = T extends `${infer _} ${infer _}` ? true : false;

/**
 * Checks if a string contains a space.
 *
 * @param self The string to check
 * @returns True if the string contains a space
 */
export const hasSpaces = (self: string): boolean => includes(' ')(self);

/**
 * Checks if a string contains no spaces.
 *
 * @param self The string to check
 * @returns True if the string contains no spaces
 */
export const hasNoSpaces = (self: string): boolean => !hasSpaces(self);
