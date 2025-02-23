import { Schema } from "effect";

export class Nothing {
  readonly _tag = "nothing" as const;
}

export const NothingSchema = Schema.Struct({ _tag: Schema.Literal("nothing") });

export const nothing = new Nothing();

export const make = (): Nothing => nothing;

export function isNothing(thing: unknown): thing is Nothing {
  return Schema.is(NothingSchema)(thing);
}
