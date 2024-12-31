/**
 * Checks if the value is a number and not NaN.
 * @param {unknown} x The value to check.
 * @returns `true` if x is a number and not NaN, `false` otherwise.
 */
export function isNumber(x: unknown): x is number {
  return typeof x === "number" && !Number.isNaN(x);
}

/**
 * Checks if the value is an integer
 * @param {unknown} x value to check
 * @returns {boolean} `true` if x is an integer, `false` otherwise.
 */
export function isInt(x: unknown): x is number {
  return isNumber(x) && Number.isInteger(x);
}

export type Range = { min: number; max: number } | [min: number, max: number];
