import { Macro, type Struct } from "@montflow/core";
import { Data, Effect, Layer, ServiceMap } from "effect";

export class ParseError extends Data.TaggedError("@Json/ParseError")<{
  error: SyntaxError;
}> {}

const makeDefault = Effect.gen(function* () {
  const parse = <T = unknown>(str: string) =>
    Effect.try({
      try: () => JSON.parse(str),
      catch: (error) => error,
    }).pipe(
      Effect.mapError((error) => error),
      Effect.map(Macro.cast<T>),
    );

  const stringify = <T extends Struct>(struct: T) =>
    Effect.try({
      try: () => JSON.stringify(struct),
      catch: (error) => error,
    }).pipe(
      Effect.mapError((error) => error),
    );

  return { parse, stringify } as const;
});

export const Id = "@pokerbids/Json";
export type Id = typeof Id;

export type Impl = Effect.Success<typeof makeDefault>;

export class Json extends ServiceMap.Service<Json, Impl>()(Id) {}

export const Default = Layer.effect(Json, makeDefault);
