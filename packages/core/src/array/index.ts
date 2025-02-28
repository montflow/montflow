import * as Function from "../function/index.js";
import * as Macro from "../macro/index.js";
import * as Maybe from "../maybe/index.js";

export const Constructor = Array;

export type NotEmpty<T> = [T, ...T[]];
export type Empty<_> = [];

export const isArray = (thing: unknown): thing is Array<unknown> => Array.isArray(thing);

export const isArrayOf: {
  <T>(thing: unknown, guard: Function.Guard<T>): thing is T[];
  <T>(guard: Function.Guard<T>): (thing: unknown) => thing is T[];
} = Macro.dualify(
  1,
  <T>(thing: unknown, guard: Function.Guard<T>): thing is T[] =>
    isArray(thing) && thing.every(guard)
);

export const isNotEmpty = <T>(array: Array<T>): array is NotEmpty<T> => array.length > 0;

export const isEmpty = <T>(array: T[]): array is Empty<T> => array.length === 0;

export const checkNotEmpty = <T>(array: T[]): Maybe.Maybe<NotEmpty<T>> =>
  isNotEmpty(array) ? Maybe.some(array) : Maybe.none();
