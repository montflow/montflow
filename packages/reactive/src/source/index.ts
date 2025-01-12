import { Optional } from "@montflow/core";

export type Source<V> = { value: V } & (() => V);

export type Snapshot<V> = { previous: Optional<V>; value: V };

export type Readonly<V> = { readonly value: V } & (() => V);

export type Unknown = Source<unknown>;
export type Any = Source<any>;

export type ValueOf<S extends Source<any>> = S extends Source<infer V> ? V : never;

export type TupleOf<Values extends readonly any[]> = Values extends readonly [
  infer V,
  ...infer Rest,
]
  ? [Source<V>, ...{ [K in keyof Rest]: Source<Rest[K]> }]
  : Values extends []
    ? []
    : never;
