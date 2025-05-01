import { Array } from "@montflow/core";
import { Source as Base } from "@montflow/reactive";

export type Getter<V> = Base.Getter<V>;
export type Setter<V> = Base.Setter<V>;
export type Updater<V> = Base.Updater<V>;

export interface Source<V> extends Base.Source<V> {}
export interface Writable<V> extends Base.Writable<V> {}

export type Readonly<V> = Base.Readonly<V>;
export type Snapshot<V> = Base.Snapshot<V>;
export type Unknown = Base.Unknown;
export type Any = Base.Any;
export type Tuple<TSources extends Array.NotEmpty<Any> = Array.NotEmpty<Any>> =
  Base.Tuple<TSources>;

export type Value<TSource extends Any> = Base.Value<TSource>;
export type ValueSnapshot<TSource extends Any> = Base.ValueSnapshot<TSource>;
export type Values<TSources extends Any[]> = Base.Values<TSources>;
export type ValueSnapshots<TSources extends Any[]> = Base.ValueSnapshots<TSources>;
export type ValuesOf<TValues extends Any[]> = Base.ValuesOf<TValues>;

export const toReadonly: Base.toReadonly = <V>(source: Writable<V> | Readonly<V>) => {
  throw new Error("missing implementation");
};
