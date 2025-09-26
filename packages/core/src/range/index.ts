import * as Array from "../array/index.js";
import * as Macro from "../macro/index.js";
import * as Number from "../number/index.js";
import * as _Object from "../object/index.js";

/**
 * @todo documentation
 * @todo testing
 */
export type Object = { readonly min: number; readonly max: number };

/**
 * @todo documentation
 * @todo testing
 */
export type Tuple = readonly [min: number, max: number];

/**
 * @todo documentation
 * @todo testing
 */
export type Range = Object | Tuple;

/**
 * @todo documentation
 * @todo testing
 */
export const isObject = (thing: unknown): thing is Object =>
  _Object.isObject(thing) &&
  _Object.hasKeys(thing, ["min", "max"]) &&
  _Object.size(thing) === 2 &&
  Number.isNumber(thing.min) &&
  Number.isNumber(thing.max) &&
  thing.min <= thing.max;

/**
 * @todo documentation
 * @todo testing
 */
export const isTuple = (thing: unknown): thing is Tuple =>
  Array.isArray(thing) &&
  Array.length(thing) === 2 &&
  Number.isNumber(thing[0]) &&
  Number.isNumber(thing[1]) &&
  thing[0] <= thing[1];

/**
 * @todo documentation
 * @todo testing
 */
export const isRange = (thing: unknown): thing is Range => isObject(thing) || isTuple(thing);

/**
 * @todo documentation
 * @todo testing
 */
export const toObject = (self: Range): Object =>
  isObject(self) ? self : { min: self[0], max: self[1] };

/**
 * @todo documentation
 * @todo testing
 */
export const toTuple = (self: Range): Tuple => (isTuple(self) ? self : [self.min, self.max]);

export class InvalidRangeError extends Error {
  constructor(
    public readonly reason: "min_greater_than_max" | "min_not_a_number" | "max_not_a_number"
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
 * @todo documentation
 * @todo testing
 */
export const make = (min: number, max: number): Range => {
  if (min > max) throw new InvalidRangeError("min_greater_than_max");
  if (!Number.isNumber(min)) throw new InvalidRangeError("min_not_a_number");
  if (!Number.isNumber(max)) throw new InvalidRangeError("max_not_a_number");
  return { min, max };
};

/**
 * @todo documentation
 * @todo testing
 */
export const of = (self: Range) => self;

/**
 * @todo documentation
 * @todo testing
 */
export const min = (self: Range): number => toObject(self).min;

/**
 * @todo documentation
 * @todo testing
 */
export const max = (self: Range): number => toObject(self).max;

/**
 * @todo documentation
 * @todo testing
 */
export const isValid = (self: Range): boolean => {
  const { min, max } = toObject(self);

  if (min > max) return false;
  if (!Number.isNumber(min)) return false;
  if (!Number.isNumber(max)) return false;

  return true;
};
