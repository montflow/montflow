import { Array, Option } from 'effect';
import { dual } from 'effect/Function';
import type { Predicate } from 'effect';

export const isArrayOf: {
  <T>(thing: unknown, guard: Predicate.Refinement<unknown, T>): thing is globalThis.Array<T>;
  <T>(guard: Predicate.Refinement<unknown, T>): (thing: unknown) => thing is globalThis.Array<T>;
} = dual(
  2,
  <T>(thing: unknown, guard: Predicate.Refinement<unknown, T>): thing is globalThis.Array<T> =>
    Array.isArray(thing) && thing.every(guard),
);

export const lastIndex = (self: ReadonlyArray<unknown>): number => Array.length(self) - 1;

export const maybeLastIndex = (self: ReadonlyArray<unknown>): Option.Option<number> =>
  Array.length(self) === 0 ? Option.none() : Option.some(lastIndex(self));

export const isLastIndex = (self: ReadonlyArray<unknown>, index: number): boolean =>
  index === lastIndex(self);

export const isLast: {
  <T>(self: ReadonlyArray<T>, element: T): boolean;
  <T>(element: T): (self: ReadonlyArray<T>) => boolean;
} = dual(2, <T>(self: ReadonlyArray<T>, element: T): boolean =>
  Option.match(Array.last(self), {
    onNone: () => false,
    onSome: (last) => last === element,
  }),
);
