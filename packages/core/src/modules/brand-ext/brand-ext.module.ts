import { type Brand } from 'effect';

/**
 * The branded form of a primitive: `Base` intersected with
 * `Brand.Brand<Id>`.
 */
export type Base<Id extends string, T> = T & Brand.Brand<Id>;

/**
 * A validation function compatible with Effect's `Brand.make`: it returns
 * `true` when the value is valid, or an error message when it is not.
 */
export type Check = (value: unknown) => true | string;

/**
 * Builds a `Check` from a boolean predicate and the message returned when the
 * predicate rejects the value.
 *
 * @param predicate The predicate to test the value against.
 * @param message The message returned when the predicate rejects the value.
 * @returns A `Check` that returns `true` or the given message.
 */
export const check =
  (predicate: (value: unknown) => boolean, message: string): Check =>
  (value) =>
    predicate(value) ? true : message;
