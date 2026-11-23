import { Context, Effect, Layer } from "effect";

const make = Effect.gen(function* () {
  return {
    // methods
  } as const;
});

export const Id = "@montflow/ServiceName";
export type Id = typeof Id;

export type Impl = Effect.Success<typeof make>;

export class ServiceName extends Context.Service<ServiceName, Impl>()(Id) {}

export const Default = Layer.effect(ServiceName, make);
