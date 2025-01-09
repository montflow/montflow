import { Evaluable, isCallable } from "../function";

/**
 * Executes a function that takes no arguments and returns its result.
 * @template T return type of the function
 * @param {() => T} fn function to execute
 * @returns {T} result of the function execution
 */
export const lambda = <T>(fn: () => T): T => fn();

/**
 * Throws the provided error and never returns.
 * @template E error kind
 * @param {E} error error to throw
 * @throws {E} always throws the provided error
 */
export const panic = <const E>(error: E): never => {
  throw error;
};

/**
 * Casts an unknown value to the specified type without runtime checks.
 * @template To target type to cast to
 * @param {unknown} x value to cast
 * @returns {To} value cast to target type
 */
export const cast = <To>(x: unknown): To => x as To;

/**
 * Asserts that a value is of the specified type without runtime checks.
 * @template Type type to assert
 * @param {unknown} _ value to assert
 * @returns {boolean} always returns true
 */
export const assertType = <Type>(_: unknown): _ is Type => true;

/**
 * Evaluates a value or function and returns the result.
 * @template T type of the value or function return
 * @param {T | (() => T)} resolvable value or function to evaluate
 * @returns {T} resolved value
 */
export const evaluate = <T>(resolvable: Evaluable<T>): T =>
  isCallable(resolvable) ? resolvable() : resolvable;

export const todo = (msg?: string) => panic(Error(msg));
