import { Array, Optional } from "@montflow/core";
import * as Subscriber from "./subscriber.js";

export type Source<V> = {
  readonly value: V;
  get: () => V;
} & Subscriber.Subscribable<V> &
  (() => V);

export type Writable<V> = {
  value: V;
  get: () => V;
  set: (value: V) => V;
} & Subscriber.Subscribable<V> &
  (() => V);

/** @alias {@link Source} */
export type Readonly<V> = Source<V>;

export type Snapshot<V> = { previous: Optional<V>; value: V };

export type Unknown = Source<unknown>;
export type Any = Source<any>;

export type Tuple<TSources extends Array.NotEmpty<Any> = Array.NotEmpty<Any>> = TSources;

export type Value<TSource extends Any> = TSource extends Source<infer V> ? V : never;
export type ValueSnapshot<TSource extends Any> =
  TSource extends Source<infer V> ? Snapshot<V> : never;

export type Values<TSources extends Any[]> =
  TSources extends [infer TSource, ...infer Rest] ?
    TSource extends Source<infer V> ?
      Rest extends Array.NotEmpty<Any> ?
        [V, ...Values<Rest>]
      : [V]
    : never
  : never;

export type ValueSnapshots<TSources extends Any[]> =
  TSources extends [] ? []
  : TSources extends [infer TSource, ...infer Rest] ?
    TSource extends Source<infer V> ?
      Rest extends Array.NotEmpty<Any> ?
        [Snapshot<V>, ...ValueSnapshots<Rest>]
      : [Snapshot<V>]
    : never
  : never;

export type ValuesOf<TValues extends Any[]> =
  TValues extends [infer V, ...infer Rest] ?
    [Source<V>, ...{ [K in keyof Rest]: Source<Rest[K]> }]
  : TValues extends [] ? []
  : never;
