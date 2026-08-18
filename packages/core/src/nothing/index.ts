import * as Domain from "../domain/index.js";
import * as Macro from "../macro/index.js";
import * as Table from "../table/index.js";

/**
 * Unique domain identifier for the Nothing algebraic data type.
 */
export const Id = "nothing" as const;

/**
 * Unique domain identifier type for the Nothing algebraic data type.
 */
export type Id = typeof Id;

/**
 * The `Nothing` variant represents the absence of a value.
 */
export type Nothing = {
  readonly [Domain.Id]: Id;
};

/**
 * @constructor
 *
 * Constructs a `Nothing` value.
 *
 * @returns A `Nothing` value
 */
export const make = Macro.singleton(
  "@montflow/nothing",
  (): Nothing => ({ [Domain.Id]: Id })
);

/**
 * Returns `true` if the given value is a `Nothing`.
 *
 * @param thing Unknown value
 * @returns Type guard for `Nothing`
 */
export const isNothing = (thing: unknown): thing is Nothing =>
  Table.isObject(thing)
  && Table.hasKeys(thing, [Domain.Id])
  && Table.size(thing) === 1
  && thing[Domain.Id] === ("nothing" as const);
