/**
 * Explicit empty type
 */
export type Nothing = {
  readonly nothing: true;
};

/**
 * @internal
 */
let _nothing: undefined | Nothing;

/**
 * @constructor
 * @returns {Nothing} nothing instance
 */
export const Nothing = (): Nothing =>
  _nothing !== undefined ? _nothing : (_nothing = { nothing: true });

/**
 * Checks if thing is instance of `Nothing`
 * @param {unknown} thing value to be checked
 * @returns {boolean} `true` thins is `Nothing`. Otherwise `false`
 */
export function isNothing(thing: unknown): thing is Nothing {
  if (typeof thing !== "object") return false;
  if (thing === null) return false;
  if (Object.keys(thing).length !== 1) return false;
  if (!("nothing" in thing && typeof thing.nothing === "boolean")) return false;

  return thing.nothing;
}
