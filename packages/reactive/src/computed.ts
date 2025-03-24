import * as Source from "./source.js";

export type Computed<V> = Source.Readonly<V> & { compute: () => void };

export type ComputeStrategy<TInput> =
  | { strategy?: "always" | "once" | "never" | "loose" | "strict" }
  | { strategy?: "limit"; times: number }
  | { strategy?: "conditional"; filter: (previous: TInput, incoming: TInput) => boolean };

export type TriggerStrategy<TOutput> =
  | { strategy?: "loose" | "strict" }
  | {
      strategy?: "conditional";
      filter: (current: TOutput, next: TOutput) => boolean;
    };

export type Options<In = any, Out = In, TVerbose extends boolean = false> = {
  verbose?: TVerbose;

  /** When to run compute callback */
  compute?:
    | { strategy?: "always" | "once" | "never" | "loose" | "strict" }
    | { strategy?: "limit"; times: number }
    | { strategy?: "conditional"; filter: (previous: In, next: In) => boolean };

  /** When to trigger change in the internal compute emmition */
  trigger?:
    | { strategy?: "loose" | "strict" }
    | { strategy?: "conditional"; filter: (current: Out, next: Out) => boolean };
};

export const DEFAULT_OPTIONS = {
  compute: { strategy: "strict" },
  trigger: { strategy: "strict" },
  verbose: false,
} satisfies Options;

export namespace Mono {
  export type Callback<In, Out, TVerbose extends boolean> =
    TVerbose extends false ? (value: In) => Out : (snapshot: Source.Snapshot<In>) => Out;
}

export namespace Poly {
  export type Callback<T extends Source.Tuple, Out, TVerbose extends boolean> =
    TVerbose extends false ? (value: Source.Values<T>) => Out
    : (snapshots: Source.ValueSnapshots<T>) => Out;
}

export namespace Module {
  export interface mono {
    <const In, Out, TVerbose extends boolean = false>(
      source: Source.Source<In>,
      callback: Mono.Callback<In, Out, TVerbose>,
      options?: Options<In, Out, TVerbose>
    ): Computed<Out>;
  }

  export interface poly {
    <const T extends Source.Tuple, Out, TVerbose extends boolean = false>(
      sources: T,
      callback: Poly.Callback<T, Out, TVerbose>,
      options?: Options<Source.Values<T>, Out, TVerbose>
    ): Computed<Out>;
  }

  export type make = mono & poly;
}
