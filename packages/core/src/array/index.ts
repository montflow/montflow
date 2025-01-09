import { dualify, Guard } from "../function";

export const isArray: {
  (thing: unknown): thing is Array<unknown>;
  (): (thing: unknown) => thing is Array<unknown>;
} = dualify(1, (self: unknown): self is Array<unknown> => Array.isArray(self));

export const isArrayOf: {
  <T>(thing: unknown, guard: Guard<T>): thing is T[];
  <T>(guard: Guard<T>): (thing: unknown) => thing is T[];
} = dualify(
  2,
  <T>(self: unknown, guard: Guard<T>): self is T[] => isArray(self) && self.every(guard)
);
