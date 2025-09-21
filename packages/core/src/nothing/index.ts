import { Schema as S } from "effect";

import * as Macro from "../macro/index.js";

/**
 * @todo documentation
 */
export class Nothing {
  readonly _id = "nothing" as const;
}

/**
 * @todo documentation
 */
export const Schema = S.Struct({ _id: S.Literal("nothing") });

/**
 * @todo documentation
 * @todo testing
 */
export const make = Macro.singleton(
  "@montflow/nothing",
  (): Nothing => ({ _id: "nothing" as const })
);

/**
 * @todo documentation
 * @todo testing
 */
export const isNothing = (thing: unknown): thing is Nothing => S.is(Schema)(thing);
