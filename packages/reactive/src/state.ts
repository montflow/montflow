import * as Source from "./source.js";

export type State<V> = Source.Writable<V>;
export type Readonly<V> = Source.Readonly<V>;

export namespace Module {
  export type make = <V = unknown>(initial: V) => State<V>;
  export type readonly = <V>(state: State<V>) => Readonly<V>;
}
