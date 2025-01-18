import { dualify, Guard } from "../function";
import { Maybe, None, Some } from "../maybe";

export const isArray: {
  (thing: unknown): thing is Array<unknown>;
  (): (thing: unknown) => thing is Array<unknown>;
} = dualify(1, (thing: unknown): thing is Array<unknown> => Array.isArray(thing));

export const isArrayOf: {
  <T>(thing: unknown, guard: Guard<T>): thing is T[];
  <T>(guard: Guard<T>): (thing: unknown) => thing is T[];
} = dualify(
  2,
  <T>(thing: unknown, guard: Guard<T>): thing is T[] => isArray(thing) && thing.every(guard)
);

export type NotEmpty<T> = [T, ...T[]];

export const isNotEmpty: {
  <T>(array: T[]): array is NotEmpty<T>;
  <T>(): (array: T[]) => array is NotEmpty<T>;
} = dualify(1, <T>(array: T[]): array is NotEmpty<T> => array.length > 0);

export const checkNotEmpty: {
  <T>(array: T[]): Maybe<NotEmpty<T>>;
  <T>(): (array: T[]) => Maybe<NotEmpty<T>>;
} = dualify(
  1,
  <T>(array: T[]): Maybe<NotEmpty<T>> => (isNotEmpty(array) ? Some(array) : None())
);
