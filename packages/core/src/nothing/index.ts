import * as Domain from "../domain/index.js";
import * as Macro from "../macro/index.js";
import * as Object from "../object/index.js";

/**
 * @todo documentation
 */
export class Nothing {
  readonly [Domain.Id] = "nothing" as const;
}

/**
 * @todo documentation
 * @todo testing
 */
export const make = Macro.singleton(
  "@montflow/nothing",
  (): Nothing => ({ [Domain.Id]: "nothing" as const })
);

/**
 * @todo documentation
 * @todo testing
 * @todo implementation
 */
export const isNothing = (thing: unknown): thing is Nothing =>
  Object.isObject(thing) &&
  Object.hasKeys(thing, [Domain.Id]) &&
  Object.length(thing) === 1 &&
  thing[Domain.Id] === ("nothing" as const);
