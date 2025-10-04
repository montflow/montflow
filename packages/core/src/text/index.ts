/**
 * Capitalizes the first letter of each word in a string.
 *
 * @param str The string to capitalize
 * @returns The capitalized string
 */
export const capitalize = (str: string) =>
  str
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

/**
 * Checks if a value is a string.
 *
 * @param thing The value to check
 * @returns True if the value is a string
 *
 * @todo testing
 */
export const isString = (thing: unknown): thing is string => typeof thing === "string";

/**
 * Utility type to assert if a string is empty.
 *
 * @param str The string to check
 * @returns True if the string is empty
 *
 * @todo testing
 */
export type IsEmpty<T extends string> = T extends "" ? true : false;

/**
 * Utility type to assert if a string is not empty.
 *
 * @param str The string to check
 * @returns True if the string is not empty
 *
 * @todo testing
 */
export type IsNotEmpty<T extends string> = T extends "" ? false : true;

/**
 * Utility type to assert if a string has spaces.
 *
 * @param str The string to check
 * @returns True if the string has spaces
 *
 * @todo testing
 */
export type HasSpaces<T extends string> = T extends `${infer _} ${infer _}` ? true : false;

/**
 * Checks if a string is empty.
 *
 * @param str The string to check
 * @returns True if the string is empty
 *
 * @todo testing
 */
export const isEmpty = (str: string): boolean => str === "";

/**
 * Checks if a string is not empty.
 *
 * @param str The string to check
 * @returns True if the string is not empty
 *
 * @todo testing
 */
export const isNotEmpty = (str: string): boolean => str !== "";

/**
 * Checks if a string has spaces.
 *
 * @param str The string to check
 * @returns True if the string has spaces
 *
 * @todo testing
 */
export const hasSpaces = (str: string): boolean => str.includes(" ");

/**
 * Checks if a string has no spaces.
 *
 * @param str The string to check
 * @returns True if the string has no spaces
 *
 * @todo testing
 */
export const hasNoSpaces = (str: string): boolean => !str.includes(" ");
