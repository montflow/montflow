import * as List from "../list/index.js";
import * as Macro from "../macro/index.js";
import * as Numeric from "../numeric/index.js";
import * as _Object from "../table/index.js";

/**
 * Object representation of a range.
 */
export type Object = { readonly min: number; readonly max: number };

/**
 * Tuple representation of a range.
 */
export type Tuple = readonly [min: number, max: number];

/**
 * Range type.
 */
export type Range = Object | Tuple;

/**
 * Checks if a value is an object representation of a range.
 *
 * @param thing The value to check
 * @returns True if the value is an object representation of a range
 *
 * @todo testing
 */
export const isObject = (thing: unknown): thing is Object =>
  _Object.isObject(thing)
  && _Object.hasKeys(thing, ["min", "max"])
  && _Object.size(thing) === 2
  && Numeric.isNumber(thing.min)
  && Numeric.isNumber(thing.max)
  && thing.min <= thing.max;

/**
 * Checks if a value is a tuple representation of a range.
 *
 * @param thing The value to check
 * @returns True if the value is a tuple representation of a range
 *
 * @todo testing
 */
export const isTuple = (thing: unknown): thing is Tuple =>
  List.isArray(thing)
  && List.length(thing) === 2
  && Numeric.isNumber(thing[0])
  && Numeric.isNumber(thing[1])
  && thing[0] <= thing[1];

/**
 * Checks if a value is a range.
 *
 * @param thing The value to check
 * @returns True if the value is a range
 *
 * @todo testing
 */
export const isRange = (thing: unknown): thing is Range =>
  isObject(thing) || isTuple(thing);

/**
 * Converts a range to an object representation.
 *
 * @param self The range to convert
 * @returns The object representation of the range
 *
 * @todo testing
 */
export const toObject = (self: Range): Object =>
  isObject(self) ? self : { min: self[0], max: self[1] };

/**
 * Converts a range to a tuple representation.
 *
 * @param self The range to convert
 * @returns The tuple representation of the range
 *
 * @todo testing
 */
export const toTuple = (self: Range): Tuple =>
  isTuple(self) ? self : [self.min, self.max];

/**
 * Error thrown when a range is invalid.
 */
export class InvalidRangeError extends Error {
  constructor(
    public readonly reason:
      | "min_greater_than_max"
      | "min_not_a_number"
      | "max_not_a_number"
  ) {
    super(
      `Invalid range. ${Macro.lambda(() => {
        switch (reason) {
          case "min_greater_than_max":
            return "Min must be less than or equal to max";
          case "min_not_a_number":
            return "Min must be a number";
          case "max_not_a_number":
            return "Max must be a number";
        }
      })}`
    );
  }
}

/**
 * Creates a range.
 *
 * @param min The minimum value of the range
 * @param max The maximum value of the range
 * @returns The range
 * @throws {InvalidRangeError} If the range is invalid
 * @see {@link InvalidRangeError}
 *
 * @todo testing
 */
export const make = (min: number, max: number): Range => {
  if (min > max) throw new InvalidRangeError("min_greater_than_max");
  if (!Numeric.isNumber(min)) throw new InvalidRangeError("min_not_a_number");
  if (!Numeric.isNumber(max)) throw new InvalidRangeError("max_not_a_number");
  return { min, max };
};

/**
 * @constructor
 *
 * Identity function to construct range
 */
export const of = (self: Range) => self;

/**
 * Returns the minimum value of a range.
 *
 * @param self The range to get the minimum value of
 * @returns The minimum value of the range
 *
 * @todo testing
 */
export const min = (self: Range): number =>
  isObject(self) ? self.min : self[0];

/**
 * Returns the maximum value of a range.
 *
 * @param self The range to get the maximum value of
 * @returns The maximum value of the range
 *
 * @todo testing
 */
export const max = (self: Range): number =>
  isObject(self) ? self.max : self[1];

/**
 * Checks if a range is valid.
 *
 * @param self The range to check
 * @returns True if the range is valid
 *
 * @todo testing
 */
export const isValid = (self: Range): boolean => {
  const { min, max } = toObject(self);

  if (min > max) return false;
  if (!Numeric.isNumber(min)) return false;
  if (!Numeric.isNumber(max)) return false;

  return true;
};

/**
 * @constructor
 *
 * Creates a symmetric range around a given midpoint.
 *
 * @param midpoint The midpoint of the range
 * @param margin The delta of the range
 * @returns The symmetric range
 *
 * @throws {InvalidSymetricMarginError} If the margin is negative
 * @see {@link InvalidSymetricMarginError}
 *
 * @todo testing
 */
export const symetric = (midpoint: number, margin: number): Range => {
  if (Numeric.isNegative(margin)) throw new Error("Marging is negative");
  return make(midpoint - margin, midpoint + margin);
};
